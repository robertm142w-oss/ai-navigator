const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = readFileSync('index.html', 'utf8');
const start = html.indexOf("        const memoryKey = 'ai-navigator-team-v1';");
const sendMessageStart = html.indexOf('        async function sendMessage(', start);
const end = html.indexOf('            } finally', sendMessageStart);
const scriptEnd = html.indexOf('\n        }', end) + '\n        }'.length;
const nodes = new Map();
const storage = new Map();
const get = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', checked: false, disabled: false });
    return nodes.get(id);
};

let active = 0;
let peak = 0;
let pause = false;
const calls = [];
const workers = [];
const timers = new Map();
let nextTimer = 0;
const context = vm.createContext({
    document: { getElementById: get },
    window: { addEventListener() {} },
    localStorage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key),
    },
    Blob,
    URL,
    setTimeout(callback, delay) {
        const timer = ++nextTimer;
        timers.set(timer, { callback, delay });
        return timer;
    },
    clearTimeout(timer) { timers.delete(timer); },
    Worker: class {
        constructor() {
            workers.push(this);
            active++;
            peak = Math.max(peak, active);
        }
        postMessage(data) {
            calls.push(data);
            if (!pause) queueMicrotask(() => this.onmessage({ data: { reply: 'mock ' + calls.length } }));
        }
        terminate() { active--; }
    },
});
const evaluate = source => vm.runInContext(source, context);
const owner = get('ownerEnable');
const disable = () => {
    owner.checked = false;
    owner.onchange({ target: owner });
};

async function test() {
    vm.runInContext(html.slice(start, scriptEnd), context);
    get('aiPrompt').value = 'Improve navigation';
    await evaluate('sendMessage({proposal: true})');
    assert.equal(calls.length, 0);
    assert.equal(workers.length, 0);
    assert.match(get('aiStatus').textContent, /Enable AI first/);

    owner.checked = true;
    await evaluate('sendMessage({proposal: true})');
    assert.equal(calls.length, 4);
    assert.match(calls[0].role, /commander/i);
    assert.match(calls[1].role, /developer/i);
    assert.match(calls[2].role, /review/i);
    assert.equal(JSON.parse(calls[2].task).proposal, 'mock 2');
    assert.match(calls[3].role, /revise/i);
    assert.equal(JSON.parse(calls[3].task).review, 'mock 3');
    assert.match(get('response').textContent, /Revised proposal \(untested\):\nmock 4/);
    assert.equal(workers.length, 1);
    assert.equal(peak, 1);
    assert.equal(active, 1);
    assert.equal(JSON.parse(storage.get('ai-navigator-team-v1')).length, 1);
    const queue = JSON.parse(storage.get('ai-navigator-queue-v1'));
    assert.equal(queue.filter(item => item.status === 'completed').length, 4);
    assert.ok(queue.every(item => !Object.hasOwn(item, 'task') && !Object.hasOwn(item, 'result')));

    for (let entry = 0; entry < 10; entry++) evaluate('saveMemory({status:"unverified"})');
    assert.equal(JSON.parse(storage.get('ai-navigator-team-v1')).length, 8);
    get('aiSend').disabled = true;
    get('clearMemory').onclick();
    assert.ok(storage.has('ai-navigator-team-v1'));
    get('aiSend').disabled = false;
    get('clearMemory').onclick();
    assert.ok(!storage.has('ai-navigator-team-v1'));

    await evaluate('sendMessage()');
    assert.equal(calls.length, 5);
    assert.equal(workers.length, 1);
    assert.match(calls[4].role, /The Word/);
    assert.equal(get('response').textContent, 'mock 5');
    [...timers.values()].find(timer => timer.delay === 30000).callback();
    assert.equal(active, 0);

    pause = true;
    const pending = evaluate('sendMessage({proposal: true})');
    assert.equal(workers.length, 2);
    assert.equal(active, 1);
    disable();
    await pending;
    assert.equal(active, 0);
    assert.equal(calls.length, 6);
    assert.equal(get('aiSend').disabled, false);
    assert.match(get('response').textContent, /AI stopped by owner/);
    assert.equal(JSON.parse(storage.get('ai-navigator-queue-v1')).at(-1).status, 'interrupted');
    assert.ok(!storage.has('ai-navigator-team-v1'));
    owner.checked = true;
    const blank = evaluate('sendMessage({proposal: true})');
    workers.at(-1).onmessage({data: {reply: '   '}});
    await blank;
    assert.match(get('response').textContent, /empty reply/);
    assert.equal(active, 0);
    assert.equal(JSON.parse(storage.get('ai-navigator-queue-v1')).at(-1).status, 'failed');
    assert.ok(!storage.has('ai-navigator-team-v1'));
    console.log('PASS: model consent, shared worker, proposal flow, memory, idle cleanup and cancellation');
}

test().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
