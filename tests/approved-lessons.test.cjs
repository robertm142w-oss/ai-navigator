const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');

const source = fs.readFileSync(process.argv[2] || __dirname + '/../index.html', 'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
const script = new vm.Script(source);

function element() {
  return {
    value: '', textContent: '', checked: false, hidden: false, disabled: false,
    dataset: {}, children: [], events: {},
    addEventListener(name, fn) { this.events[name] = fn; },
    append(value) { this.children.push(value); },
    replaceChildren() { this.children = []; },
    showModal() { this.open = true; },
  };
}

function load(storage) {
  const elements = new Map();
  let cameraCount = 0;
  let attempts = 0;
  const get = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const env = vm.createContext({
    document: { getElementById: get, createElement: element, body: element() },
    window: { addEventListener() {}, Capacitor: { Plugins: {
      WordDevice: { openCamera() { cameraCount++; } },
    } } },
    localStorage: {
      getItem: key => storage.get(key),
      setItem: (key, val) => storage.set(key, val),
    },
    navigator: {},
    setTimeout,
    clearTimeout,
  });
  script.runInContext(env);
  env.onInference = () => { attempts++; };
  vm.runInContext('sendMessage = async () => onInference()', env);
  return {
    submit(phrases, reply) {
      get('lesson-phrases').value = phrases;
      get('lesson-reply').value = reply;
      get('lesson-form').events.submit({preventDefault() {}});
      return get('lesson-status').textContent;
    },
    async command(value) {
      get('aiPrompt').value = value;
      await get('aiSend').events.click();
      return get('response').textContent;
    },
    forget() { get('saved-lessons').children[0].children[0].events.click(); },
    get cameraCount() { return cameraCount; },
    get attempts() { return attempts; },
  };
}

test('approved replies persist across app reload and route before inference', async () => {
  const storage = new Map();
  const first = load(storage);
  assert.equal(first.submit('Open my flashlight\nSwitch my flashlight on', 'That wording is unavailable.'), 'Lesson saved on this device.');
  assert.equal(first.submit('Open my flashlight!', 'Replacement'), 'A phrase already has a saved reply. Forget that lesson before replacing it.');
  const reopened = load(storage);
  assert.equal(await reopened.command(' SWITCH  my flashlight ON! '), 'That wording is unavailable.');
  assert.equal(reopened.attempts, 0);
});

test('existing built-in and explicit proposal routes take precedence', async () => {
  const app = load(new Map());
  app.submit('open camera\npropose an improvement', 'Do not use me');
  await app.command('Open camera');
  assert.equal(app.cameraCount, 1);
  assert.equal(app.attempts, 0);
  await app.command('propose an improvement');
  assert.equal(app.attempts, 1);
});

test('forget removes the saved reply', async () => {
  const storage = new Map();
  const app = load(storage);
  app.submit('do the thing', 'Saved');
  app.forget();
  const reopened = load(storage);
  await reopened.command('do the thing');
  assert.equal(reopened.attempts, 1);
});

test('invalid lesson data is ignored', async () => {
  const app = load(new Map([['the-word-approved-lessons-v1', '{"reply":"not a list"}']]));
  await app.command('do the thing');
  assert.equal(app.attempts, 1);
});
