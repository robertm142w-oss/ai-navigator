const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { setImmediate } = require('node:timers/promises');
const { test } = require('node:test');

let initLessonSharing;
test.before(async () => {
    ({ initLessonSharing } = await import('../src/lesson-sharing.js'));
});

const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
const webApp = new vm.Script(html.match(/<script>([\s\S]*)<\/script>/)[1]);
const fields = [
    'status', 'code', 'input', 'output', 'lesson', 'state',
    'pair', 'revoke', 'share', 'import', 'offer'
];
const buttonNames = ['pair', 'revoke', 'share', 'import', 'offer'];

function element() {
    return {
        value: '', textContent: '', hidden: false, disabled: false, checked: false,
        dataset: {}, children: [], handlers: {},
        addEventListener(event, handler) { this.handlers[event] = handler; },
        append(child) { this.children.push(child); },
        replaceChildren(...children) {
            this.children = children;
            this.value = children[0]?.value ?? '';
        },
        select() {}
    };
}

function simulateDatabase(records) {
    return {
        open() {
            const request = {
                result: {
                    transaction() {
                        const transaction = {
                            objectStore() {
                                return {
                                    get(key) { return { result: structuredClone(records.get(key)) }; },
                                    put(value, key) {
                                        records.set(key, structuredClone(value));
                                        return { result: key };
                                    }
                                };
                            }
                        };
                        queueMicrotask(() => transaction.oncomplete());
                        return transaction;
                    }
                }
            };
            queueMicrotask(() => request.onsuccess());
            return request;
        }
    };
}

async function openDevice(profile) {
    const elements = new Map();
    const get = id => {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
    };
    const context = vm.createContext({
        document: { getElementById: get, createElement: element, body: element() },
        window: { addEventListener() {} },
        localStorage: {
            getItem: key => profile.lessons.get(key),
            setItem: (key, value) => profile.lessons.set(key, value)
        },
        navigator: {}, setTimeout, clearTimeout
    });
    webApp.runInContext(context);
    let inferenceCalls = 0;
    context.countInference = () => { inferenceCalls++; };
    const vmApi = vm.runInContext(
        'sendMessage = async () => countInference(); ({readLessons, appendApprovedLesson})',
        context
    );
    const ui = Object.fromEntries(fields.map(name => {
        assert.match(html, new RegExp('id="pairing-' + name + '"'));
        return [name, get('pairing-' + name)];
    }));
    const buttons = buttonNames.map(name => ui[name]);
    const panel = {
        open: true,
        querySelector: selector => get(selector.slice(1)),
        querySelectorAll: () => buttons,
        addEventListener() {}
    };
    globalThis.indexedDB = simulateDatabase(profile.identity);
    initLessonSharing({ panel, loadLessons: vmApi.readLessons, appendLesson: vmApi.appendApprovedLesson });
    for (let tick = 0; buttons.some(button => button.disabled); tick++) {
        if (tick >= 1000) throw new Error('Pairing controls did not initialize.');
        await setImmediate();
    }
    return {
        ui,
        async tap(name, { message = '', confirm = false, code = null } = {}) {
            globalThis.window = { confirm: () => confirm, prompt: () => code };
            ui.input.value = message;
            await ui[name].handlers.click();
        },
        save(phrase, reply) {
            get('lesson-phrases').value = phrase;
            get('lesson-reply').value = reply;
            get('lesson-form').handlers.submit({ preventDefault() {} });
            return get('lesson-status').textContent;
        },
        async command(text) {
            const before = inferenceCalls;
            get('aiPrompt').value = text;
            await get('aiSend').handlers.click();
            return { reply: get('response').textContent, ranInference: inferenceCalls > before };
        }
    };
}

function newProfile() {
    return { identity: new Map(), lessons: new Map() };
}

async function pairBetween(first, second) {
    await first.tap('offer');
    await second.tap('offer');
    await first.tap('pair', { message: second.ui.output.value, code: first.ui.code.textContent });
    assert.match(first.ui.status.textContent, /codes do not match/i);
    assert.equal(first.ui.state.textContent, 'No device paired');
    await first.tap('pair', { message: second.ui.output.value, code: second.ui.code.textContent });
    await second.tap('pair', { message: first.ui.output.value, code: first.ui.code.textContent });
    assert.equal(first.ui.state.textContent, 'One device paired');
    assert.equal(second.ui.state.textContent, 'One device paired');
}

test('two devices verify, reject, approve, reopen, and revoke an actual saved lesson', async t => {
    const previousGlobals = { indexedDB: globalThis.indexedDB, Option: globalThis.Option, window: globalThis.window };
    t.after(() => {
        for (const [name, original] of Object.entries(previousGlobals)) {
            if (original === undefined) delete globalThis[name];
            else globalThis[name] = original;
        }
    });
    globalThis.Option = class {
        constructor(label, value) { this.label = label; this.value = value; }
    };

    const firstProfile = newProfile();
    const secondProfile = newProfile();
    const first = await openDevice(firstProfile);
    const second = await openDevice(secondProfile);
    const phrase = 'Explain the test lesson';
    const reply = 'The handoff finished.';
    assert.notEqual(first.ui.code.textContent, second.ui.code.textContent);
    assert.equal(first.save(phrase, reply), 'Lesson saved on this device.');
    await pairBetween(first, second);
    await first.tap('share');
    const bundle = first.ui.output.value;
    assert.ok(bundle.includes('the-word:lesson:v1'));

    const modified = JSON.parse(bundle);
    modified[3] = JSON.stringify({ phrases: [phrase], reply: 'Tampered reply.' });
    await second.tap('import', { message: JSON.stringify(modified), confirm: true });
    assert.match(second.ui.status.textContent, /signature could not be verified/);
    assert.equal((await second.command(phrase)).ranInference, true);

    await second.tap('import', { message: bundle, confirm: false });
    assert.equal((await second.command(phrase)).ranInference, true);
    await second.tap('import', { message: bundle, confirm: true });
    assert.equal(second.ui.status.textContent, 'Lesson approved and saved on this phone.');
    assert.deepEqual(await second.command(phrase), { reply, ranInference: false });
    await second.tap('import', { message: bundle, confirm: true });
    assert.match(second.ui.status.textContent, /duplicate or conflicting/i);
    assert.equal(JSON.parse(secondProfile.lessons.get('the-word-approved-lessons-v1')).length, 1);

    const reopened = await openDevice(secondProfile);
    assert.equal(reopened.ui.code.textContent, second.ui.code.textContent);
    assert.equal(reopened.ui.state.textContent, 'One device paired');
    assert.deepEqual(await reopened.command(phrase), { reply, ranInference: false });
    await reopened.tap('revoke', { confirm: true });
    assert.equal(reopened.ui.state.textContent, 'No device paired');

    const revoked = await openDevice(secondProfile);
    assert.equal(revoked.ui.state.textContent, 'No device paired');
    assert.equal(revoked.ui.import.hidden, true);
    await revoked.tap('import', { message: bundle, confirm: true });
    assert.match(revoked.ui.status.textContent, /does not have lesson-sharing access/);
    assert.deepEqual(await revoked.command(phrase), { reply, ranInference: false });
});
