const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

function loadCommands() {
    const html = readFileSync('index.html', 'utf8');
    const start = html.indexOf('        const commandInput');
    const source = html.slice(start, html.indexOf('</script>', start));
    const elements = new Map();
    const requests = [];
    let active = false;
    let shared;
    const context = vm.createContext({
        window: {},
        navigator: { share: async payload => { shared = payload; } },
        document: {
            body: { dataset: {} },
            getElementById(id) {
                if (!elements.has(id)) {
                    elements.set(id, {
                        checked: false, hidden: true, open: false, textContent: '',
                        addEventListener(event, handler) { this[event] = handler; },
                        scrollIntoView() {}, focus() {}
                    });
                }
                return elements.get(id);
            }
        },
        watchId: null,
        parseDest: text => text === '45.52, -122.68',
        startTracking: async () => { active = true; },
        stopTracking: () => { active = false; },
        resetInference: () => {},
        cancelledMessage: 'AI stopped by owner.',
        sendMessage: async options => { requests.push(options.proposal); }
    });
    vm.runInContext(source, context);
    const run = async command => {
        elements.get('aiPrompt').value = command;
        await vm.runInContext('runCommand()', context);
    };
    return { elements, requests, run, active: () => active, shared: () => shared };
}

test('local commands route ahead of model and validate coordinates', async () => {
    const { elements, requests, run, active } = loadCommands();
    await run('Open settings');
    assert.equal(elements.get('owner-settings').open, true);
    await run('Show task queue');
    assert.equal(elements.get('queue-panel').open, true);
    await run('Reflect on a conversation');
    assert.match(elements.get('response').textContent, /someone else/);
    await run('Navigate to 45x, -122');
    assert.equal(active(), false);
    await run('Navigate to 45.52 comma minus 122.68');
    assert.equal(active(), true);
    await run('Stop navigation');
    assert.equal(active(), false);
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
