const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const vm = require('node:vm');

const page = process.env.WORD_TEST_PAGE || path.join(__dirname, '..', 'index.html');
const source = fs.readFileSync(page, 'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
const script = new vm.Script(source, {filename: page});
const key = 'the-word-approved-lessons-v1';
let commanderModule;
test.before(async () => {
    commanderModule = await import('../src/commander-workflow.js');
});

function makeElement() {
    return {
        textContent: '', value: '', dataset: {}, children: [], events: new Map(),
        addEventListener(name, handler) { this.events.set(name, handler); },
        append(child) { this.children.push(child); },
        replaceChildren() { this.children = []; },
        showModal() { this.open = true; },
    };
}

function pageHarness({storage = new Map(), device, allowAI = false, teamMode = false} = {}) {
    const elements = new Map();
    const get = id => {
        if (!elements.has(id)) elements.set(id, makeElement());
        return elements.get(id);
    };
    get('ownerEnable').checked = allowAI;
    get('teamMode').checked = teamMode;
    const calls = [];
    const storageState = {writeError: false, readError: false};
    const env = vm.createContext({
        document: {getElementById: get, createElement: makeElement, body: makeElement()},
        window: {addEventListener() {}, Capacitor: {Plugins: {WordDevice: device}}},
        localStorage: {
            getItem(name) {
                if (storageState.readError && name === key) throw new Error('blocked');
                return storage.get(name) ?? null;
            },
            setItem(name, value) {
                if (storageState.writeError && name === key) throw new Error('quota');
                storage.set(name, value);
            },
        },
        navigator: {},
        setTimeout,
        clearTimeout,
        calls,
        commanderModule,
    });
    script.runInContext(env);
    vm.runInContext(`
        loadCommanderWorkflow = async () => commanderModule;
        isolatedAsk = async (role, prompt) => {
            calls.push({role, prompt});
            return 'Mock assistant reply.';
        };
        retryWorker = async (role, input) => {
            calls.push({role, prompt: JSON.parse(input).request});
            return role.startsWith('Commander:')
                ? JSON.stringify({steps: ['Draft and review a concise proposal.']})
                : 'Mock team reply.';
        };
    `, env);
    return {
        get, calls, storageState,
        openLessons() { get('open-lessons').events.get('click')(); },
        save(phrases, reply) {
            get('lesson-phrases').value = phrases;
            get('lesson-reply').value = reply;
            get('lesson-form').events.get('submit')({preventDefault() {}});
            return get('lesson-status').textContent;
        },
        forgetFirst() { get('saved-lessons').children[0].children[0].events.get('click')(); },
        async command(value) {
            get('aiPrompt').value = value;
            await get('aiSend').events.get('click')();
            return {reply: get('response').textContent, status: get('aiStatus').textContent};
        },
    };
}

test('only approval writes a lesson and aliases still resolve after reopening', async () => {
    const storage = new Map();
    const app = pageHarness({storage});
    app.openLessons();
    app.get('lesson-phrases').value = 'A private reminder';
    app.get('lesson-reply').value = 'Reply to save.';
    assert.equal(storage.has(key), false);
    assert.match(app.save('a private reminder\nremind me privately', 'Reply to save.'), /saved/i);

    const reopened = pageHarness({storage, teamMode: true});
    assert.deepEqual(await reopened.command('  REMIND   ME  PRIVATELY?! '), {
        reply: 'Reply to save.', status: 'Ready',
    });
    assert.equal(reopened.get('ownerEnable').checked, false);
    assert.deepEqual(reopened.calls, []);
});

test('built-in actions take precedence over saved replies for both torch directions', async () => {
    const camera = [];
    const torch = [];
    const app = pageHarness({device: {
        openCamera: async () => camera.push('opened'),
        setTorch: async ({enabled}) => torch.push(enabled),
    }});
    app.save('open camera\nopen my flashlight\nturn off my flashlight', 'Shadowed lesson.');
    await app.command('Open camera');
    assert.equal((await app.command('Open my flashlight!')).reply, 'Flashlight on.');
    assert.equal((await app.command('Turn off my flashlight!')).reply, 'Flashlight off.');
    assert.deepEqual(camera, ['opened']);
    assert.deepEqual(torch, [true, false]);
    assert.deepEqual(app.calls, []);
});

test('an explicit proposal takes precedence and still requires the model consent control', async () => {
    const app = pageHarness();
    app.save('propose an improvement: shorter replies', 'Shadowed lesson.');
    assert.match((await app.command('Propose an improvement: shorter replies')).status, /enable AI/i);
    assert.deepEqual(app.calls, []);
    app.get('ownerEnable').checked = true;
    await app.command('Propose an improvement: shorter replies');
    assert.match(app.calls[0].role, /^Commander:/);
    assert.equal(app.calls.length, 4);
});

test('opposite and negated requests do not reuse a saved affirmative reply', async () => {
    const app = pageHarness({allowAI: true});
    app.save('enable my study reminder', 'The reminder is saved as a lesson.');
    assert.match((await app.command('ENABLE MY STUDY REMINDER!')).reply, /saved as a lesson/);
    assert.deepEqual(app.calls, []);
    for (const request of ['disable my study reminder', "don't enable my study reminder"]) {
        assert.equal((await app.command(request)).reply, 'Mock assistant reply.');
    }
    assert.deepEqual(app.calls.map(call => call.prompt), [
        'disable my study reminder', "don't enable my study reminder",
    ]);
});

test('ignores damaged lesson JSON, invalid types, and whitespace-only replies', async () => {
    for (const records of [
        '{bad json',
        '{"phrases":["snow day"],"reply":"no array"}',
        '[{"phrases":[12],"reply":"non-text phrase"}]',
        '[{"phrases":["snow day"],"reply":19}]',
        '[{"phrases":["snow day"],"reply":"  "}]',
    ]) {
        const app = pageHarness({storage: new Map([[key, records]]), allowAI: true});
        assert.equal((await app.command('snow day')).reply, 'Mock assistant reply.', records);
    }
});

test('a good record survives alongside a damaged entry', async () => {
    const storage = new Map([[key, JSON.stringify([
        {phrases: [12], reply: 'Invalid'},
        {phrases: ['snow day'], reply: 'Verified snow day reply.'},
    ])]]);
    const app = pageHarness({storage});
    assert.equal((await app.command('Snow day!')).reply, 'Verified snow day reply.');
    assert.deepEqual(app.calls, []);
});

test('a failed write leaves the existing lesson intact and supports saving later', async () => {
    const storage = new Map();
    const app = pageHarness({storage});
    assert.match(app.save('snow day', 'Existing reply.'), /saved/i);
    app.storageState.writeError = true;
    assert.match(app.save('storms tonight', 'New reply.'), /could not write/i);
    assert.equal(JSON.parse(storage.get(key)).length, 1);

    const reopened = pageHarness({storage, allowAI: true});
    assert.equal((await reopened.command('snow day')).reply, 'Existing reply.');
    assert.equal((await reopened.command('storms tonight')).reply, 'Mock assistant reply.');
    assert.match(reopened.save('storms tonight', 'New reply.'), /saved/i);
    assert.equal((await reopened.command('storms tonight')).reply, 'New reply.');
});

test('forgetting removes the saved reply on the next launch', async () => {
    const storage = new Map();
    const app = pageHarness({storage});
    app.save('snow day', 'Existing reply.');
    app.forgetFirst();
    const reopened = pageHarness({storage, allowAI: true});
    assert.equal((await reopened.command('snow day')).reply, 'Mock assistant reply.');
});

test('temporary loss of read access does not erase the approved lesson', async () => {
    const app = pageHarness({allowAI: true});
    app.save('snow day', 'Existing reply.');
    app.storageState.readError = true;
    assert.equal((await app.command('snow day')).reply, 'Mock assistant reply.');
    app.storageState.readError = false;
    assert.equal((await app.command('snow day')).reply, 'Existing reply.');
});
