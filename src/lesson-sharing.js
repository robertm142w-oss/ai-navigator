import {
    approvePeer, createDeviceIdentity, revokePeer, signLesson, verifyLesson
} from './device-pairing.js';

const databaseName = 'the-word-device-sharing';
const storeName = 'pairing';

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(storeName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Device pairing storage is unavailable.'));
    });
}

function databaseOperation(database, key, value) {
    return new Promise((resolve, reject) => {
        const mode = value === undefined ? 'readonly' : 'readwrite';
        const transaction = database.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        const request = value === undefined ? store.get(key) : store.put(value, key);
        transaction.oncomplete = () => resolve(request.result);
        transaction.onabort = () => reject(new Error('Device pairing storage is unavailable.'));
    });
}

export function initLessonSharing({ panel, loadLessons, appendLesson }) {
    const get = id => panel.querySelector('#' + id);
    const status = get('pairing-status');
    const code = get('pairing-code');
    const incoming = get('pairing-input');
    const outgoing = get('pairing-output');
    const lessonSelect = get('pairing-lesson');
    const buttons = Array.from(panel.querySelectorAll('button'));
    let database;
    let identity;
    let peer;
    let lessons = [];
    let busy = false;

    function render() {
        const active = Boolean(peer && !peer.revoked);
        get('pairing-state').textContent = active ? 'One device paired' : 'No device paired';
        get('pairing-pair').hidden = active;
        get('pairing-revoke').hidden = !active;
        get('pairing-share').hidden = !active;
        get('pairing-import').hidden = !active;
        lessonSelect.hidden = !active;
        lessons = loadLessons();
        lessonSelect.replaceChildren(...lessons.map((lesson, index) =>
            new Option(lesson.phrases[0], String(index))
        ));
    }

    async function prepare() {
        if (!database) database = await openDatabase();
        if (!identity) {
            identity = await databaseOperation(database, 'identity');
            if (!identity) {
                const candidate = await createDeviceIdentity();
                await databaseOperation(database, 'identity', candidate);
                identity = candidate;
            }
            code.textContent = identity.pairingCode;
        }
        peer = await databaseOperation(database, 'peer');
    }

    async function run(action) {
        if (busy) return;
        busy = true;
        buttons.forEach(button => { button.disabled = true; });
        status.textContent = '';
        try {
            await prepare();
            await action();
            render();
        } catch (error) {
            status.textContent = error.message || 'Lesson sharing is unavailable.';
        } finally {
            buttons.forEach(button => { button.disabled = false; });
            busy = false;
        }
    }

    function refresh() {
        if (panel.open) run(() => undefined);
    }

    panel.addEventListener('toggle', refresh);
    refresh();

    get('pairing-offer').addEventListener('click', () => run(() => {
        outgoing.value = identity.offer;
        outgoing.select();
        status.textContent = 'Copy the pairing message to your other phone.';
    }));

    get('pairing-pair').addEventListener('click', () => run(async () => {
        if (peer && !peer.revoked) throw new Error('Revoke the current pairing first.');
        const suppliedCode = window.prompt('Enter the pairing code shown on the other phone.');
        if (suppliedCode === null) return;
        const approved = await approvePeer(incoming.value, suppliedCode.trim().toLowerCase().replace(/\s+/g, ' '));
        if (approved.id === identity.id) throw new Error('Choose a different device.');
        await databaseOperation(database, 'peer', approved);
        peer = approved;
        incoming.value = '';
        status.textContent = 'Device paired. Approve this phone on the other device too.';
    }));

    get('pairing-revoke').addEventListener('click', () => run(async () => {
        if (!peer || peer.revoked || !window.confirm('Revoke this device’s lesson sharing?')) return;
        const revoked = revokePeer(peer);
        await databaseOperation(database, 'peer', revoked);
        peer = revoked;
        incoming.value = '';
        outgoing.value = '';
        status.textContent = 'Pairing revoked on this phone. Previously saved lessons remain.';
    }));

    get('pairing-share').addEventListener('click', () => run(async () => {
        if (lessonSelect.value === '') throw new Error('Save an approved lesson first.');
        const lesson = lessons[Number(lessonSelect.value)];
        if (!lesson) throw new Error('Choose an approved lesson.');
        outgoing.value = await signLesson(identity, peer, JSON.stringify(lesson));
        outgoing.select();
        status.textContent = 'Copy the signed lesson to your other phone.';
    }));

    get('pairing-import').addEventListener('click', () => run(async () => {
        const text = await verifyLesson(identity.id, peer, incoming.value);
        let lesson;
        try {
            lesson = JSON.parse(text);
        } catch {
            throw new Error('Invalid lesson data.');
        }
        if (!Array.isArray(lesson?.phrases) || !lesson.phrases.every(phrase => typeof phrase === 'string') ||
            typeof lesson.reply !== 'string') {
            throw new Error('Invalid lesson data.');
        }
        if (!window.confirm('Save this lesson from the paired device?\n\n' +
            lesson.phrases.join('\n') + '\n\nReply: ' + lesson.reply)) return;
        if (!appendLesson(lesson)) {
            throw new Error('Lesson could not be saved. Check for a duplicate or conflicting phrase.');
        }
        incoming.value = '';
        status.textContent = 'Lesson approved and saved on this phone.';
    }));
}
