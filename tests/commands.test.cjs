const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

function loadCommands(plugins = {}, storage = new Map(), reducedMotion = false) {
    const html = readFileSync('index.html', 'utf8');
    const start = html.indexOf('        const commandInput');
    const helperStart = html.indexOf('        function checkIntegerDifference');
    const helperEnd = html.indexOf('        function checkMarkedExamples', helperStart);
    const source = html.slice(helperStart, helperEnd) + html.slice(start, html.indexOf('</script>', start));
    const elements = new Map();
    const requests = [];
    const requestsText = [];
    let active = false;
    let shared;
    const context = vm.createContext({
        window: { Capacitor: { Plugins: plugins }, matchMedia: () => ({matches: reducedMotion}) },
        navigator: { share: async payload => { shared = payload; } },
        localStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, value)
        },
        document: {
            body: { dataset: {} },
            getElementById(id) {
                if (!elements.has(id)) {
                    elements.set(id, {
                        checked: false, hidden: true, open: false, textContent: '', dataset: {},
                        addEventListener(event, handler) { this[event] = handler; },
                        scrollIntoView() {}, focus() {}, showModal() { this.open = true; }, setAttribute() {}
                    });
                }
                return elements.get(id);
            }
        },
        lastAIRequestMs: 1250,
        watchId: null,
        parseDest: text => text === '45.52, -122.68',
        startTracking: async () => { active = true; },
        stopTracking: () => { active = false; },
        resetInference: () => {},
        cancelledMessage: 'AI stopped by owner.',
        sendMessage: async options => { requests.push(options.proposal); requestsText.push(options.request); }
    });
    vm.runInContext(source, context);
    const run = async command => {
        elements.get('aiPrompt').value = command;
        await vm.runInContext('runCommand()', context);
    };
    return { elements, requests, requestsText, run, theme: () => context.document.body.dataset.theme, active: () => active, shared: () => shared };
}

function emblemPointer(timeStamp, clientY = 100) {
    return { isPrimary: true, button: 0, pointerId: 1, clientX: 50, clientY, timeStamp };
}

test('the emblem tap starts and stops a speech session', async () => {
    const speech = Promise.withResolvers();
    const started = Promise.withResolvers();
    let listening = false;
    const { elements, requests } = loadCommands({WordVoice: {
        listen() {
            listening = true;
            started.resolve();
            return speech.promise;
        },
        async stop() {
            if (listening) speech.resolve({text: 'A cancelled command'});
        },
    }});
    const emblem = elements.get('word-emblem');
    emblem.pointerdown(emblemPointer(0));
    emblem.pointerup(emblemPointer(100));
    const initialTap = emblem.click({detail: 1});
    await started.promise;
    await emblem.click({detail: 1});
    await initialTap;
    assert.match(elements.get('aiStatus').textContent, /Listening stopped/);
    assert.deepEqual(requests, []);
});

test('holding the emblem opens controls without starting the microphone', async () => {
    let listens = 0;
    const { elements } = loadCommands({WordVoice: {
        stop: async () => {},
        listen: async () => { listens++; return {text: 'Hello'}; },
    }});
    const emblem = elements.get('word-emblem');
    emblem.pointerdown(emblemPointer(0));
    emblem.pointerup(emblemPointer(650));
    await emblem.click({detail: 1});
    assert.equal(elements.get('owner-settings').open, true);
    assert.equal(listens, 0);
});

test('swiping up spins once, suppresses the tap, and honors reduced motion', async () => {
    for (const reducedMotion of [false, true]) {
        let listens = 0;
        const { elements } = loadCommands({WordVoice: {
            stop: async () => {},
            listen: async () => { listens++; return {text: 'Hello'}; },
        }}, new Map(), reducedMotion);
        const emblem = elements.get('word-emblem');
        emblem.pointerdown(emblemPointer(0));
        emblem.pointermove(emblemPointer(80, 62));
        emblem.pointerup(emblemPointer(120, 38));
        await emblem.click({detail: 1});
        assert.equal(Object.hasOwn(emblem.dataset, 'spinning'), !reducedMotion);
        assert.equal(elements.get('owner-settings').open, false);
        assert.equal(listens, 0);
        emblem.animationend({animationName: 'arrow-tribute'});
        assert.equal(Object.hasOwn(emblem.dataset, 'spinning'), false);
    }
});

test('appearance can be changed and restored without enabling AI', () => {
    const storage = new Map([['the-word-appearance-v1', 'unknown']]);
    const app = loadCommands({}, storage);
    assert.equal(app.theme(), 'forest');
    const appearance = app.elements.get('appearance-theme');
    appearance.value = 'midnight';
    appearance.change();
    assert.equal(app.theme(), 'midnight');
    assert.equal(loadCommands({}, storage).theme(), 'midnight');
    assert.deepEqual(app.requests, []);
});

test('local commands route ahead of the model and navigation stays paused', async () => {
    const { elements, requests, run, active } = loadCommands();
    await run('Open settings');
    assert.equal(elements.get('owner-settings').open, true);
    await run('Show task queue');
    assert.equal(elements.get('queue-panel').open, true);
    await run('Reflect on a conversation');
    assert.match(elements.get('response').textContent, /someone else/);
    await run('Navigate to 45.52 comma minus 122.68');
    assert.equal(active(), false);
    assert.match(elements.get('response').textContent, /Navigation is paused/);
    assert.deepEqual(requests, []);
    await run('Propose an improvement: shorten the task summaries');
    await run('Tell me a story');
    assert.deepEqual(requests, [true, false]);
});

test('sharing requires a separate tap on the system share button', async () => {
    const { elements, run, shared } = loadCommands();
    await run('Reflect on a conversation');
    await run('Share reply');
    assert.equal(shared(), undefined);
    await elements.get('share-reply').click();
    assert.equal(shared().title, 'The Word');
    assert.match(shared().text, /conversation/);
    assert.equal(elements.get('share-reply').hidden, true);
});

test('a successful spoken command submits directly and can read the reply aloud', async () => {
    let spoken;
    const { elements, requests } = loadCommands({
        WordVoice: {
            stop: async () => {},
            listen: async () => ({ text: 'Hello' }),
            speak: async ({ text }) => { spoken = text; }
        }
    });
    elements.get('speech-enable').checked = true;
    await elements.get('mic-btn').click();
    assert.equal(elements.get('aiPrompt').value, 'Hello');
    assert.match(elements.get('response').textContent, /^Hello/);
    assert.match(spoken, /^Hello/);
    assert.deepEqual(requests, []);
});

test('camera and flashlight commands route directly to the device bridge', async () => {
    const actions = [];
    const { run, requests } = loadCommands({
        WordDevice: {
            openCamera: async () => { actions.push('camera'); },
            setTorch: async ({ enabled }) => { actions.push(enabled); }
        }
    });
    await run('Open camera');
    await run('Turn on flashlight');
    await run('Flashlight off');
    await run('Open my flashlight');
    await run('Can you turn my flashlight off, please?');
    assert.deepEqual(actions, ['camera', true, false, true, false]);
    assert.deepEqual(requests, []);
});

test('a missing flashlight bridge returns a local reply without starting Commander', async () => {
    const { elements, requests, run } = loadCommands();
    await run('Open my flashlight');
    assert.match(elements.get('response').textContent, /Flashlight control is unavailable/);
    assert.deepEqual(requests, []);
});

test('improve yourself sends a bounded core-improvement request to proposal mode', async () => {
    const { requests, requestsText, run } = loadCommands();
    await run('Improve yourself');
    assert.deepEqual(requests, [true]);
    assert.match(requestsText[0], /one small improvement/);
    assert.match(requestsText[0], /keep approval controls intact/);
});

test('integer difference checks give exact results without starting AI', async () => {
    const { elements, requests, run } = loadCommands();
    const examples = [
        ['Check the difference between 10 and 7 is 9', /^Incorrect.*= 3/],
        ['Difference between -5 and 2 equals 7', /^Correct.*= 7/],
        ['Calculate the difference between 2 and -5', /= 7/],
        ['What is the difference between -4 and -4?', /= 0/],
        ['Difference between 9007199254740993 and 0', /= 9007199254740993/],
        ['Difference between 1.5 and 0', /Use two integers/]
    ];
    for (const [command, response] of examples) {
        await run(command);
        assert.match(elements.get('response').textContent, response);
    }
    assert.deepEqual(requests, []);
});

test('calendar commands open an editor with just the user-supplied title', async () => {
    const drafts = [];
    const { elements, requests, run } = loadCommands({
        WordDevice: { draftCalendarEvent: async ({title}) => { drafts.push(title); } }
    });
    await run('Draft calendar event: Call Robert');
    assert.deepEqual(drafts, ['Call Robert']);
    assert.match(elements.get('response').textContent, /Choose the date and time/);
    await run('Draft calendar event for ' + 'x'.repeat(121));
    assert.deepEqual(drafts, ['Call Robert']);
    assert.match(elements.get('response').textContent, /up to 120 characters/);
    assert.deepEqual(requests, []);
});

test('diagnostics show native memory pressure separately from elapsed AI request time', async () => {
    const { elements, requests, run } = loadCommands({
        WordDevice: { memoryStatus: async () => ({
            lowMemory: true,
            lastExitReason: 'Android recorded an app crash',
            lastExitTime: 1795835857000
        }) }
    });
    await run('Show diagnostics');
    assert.match(elements.get('response').textContent, /Android reports memory pressure/);
    assert.match(elements.get('response').textContent, /Last AI request time: 1.3 s/);
    assert.match(elements.get('response').textContent, /Most recent recorded app process exit: Android recorded an app crash at/);
    assert.deepEqual(requests, []);
});

test('wake phrase test only dispatches commands addressed to The Word', async () => {
    const speech = ['Open camera', 'Hey The Word, open camera', 'Hey The Word', 'Open camera'];
    let opens = 0;
    const { elements } = loadCommands({
        WordVoice: { stop: async () => {}, listen: async () => ({text: speech.shift()}) },
        WordDevice: { openCamera: async () => { opens++; } }
    });
    await elements.get('wake-test').click();
    assert.equal(opens, 0);
    assert.match(elements.get('aiStatus').textContent, /at the start/);
    await elements.get('wake-test').click();
    await elements.get('wake-test').click();
    assert.equal(opens, 2);
    assert.equal(elements.get('wake-stop').hidden, true);
});
