const assert = require('node:assert/strict');
const test = require('node:test');
let approvePeer, createDeviceIdentity, revokePeer, signLesson, verifyLesson;
let samsung, secondPhone, stranger, samsungPeer, secondPeer, lesson, message;

test.before(async () => {
    ({ approvePeer, createDeviceIdentity, revokePeer, signLesson, verifyLesson } =
        await import('../src/device-pairing.js'));
    [samsung, secondPhone, stranger] = await Promise.all(
        Array.from({ length: 3 }, () => createDeviceIdentity())
    );
    [samsungPeer, secondPeer] = await Promise.all([
        approvePeer(samsung.offer, samsung.pairingCode),
        approvePeer(secondPhone.offer, secondPhone.pairingCode)
    ]);
    lesson = JSON.stringify({ phrases: ['open flashlight'], reply: 'Flashlight control is unavailable.' });
    message = await signLesson(samsung, secondPeer, lesson);
});

test('the intended phone can authenticate and read the lesson after pairing', async () => {
    assert.equal(await verifyLesson(secondPhone.id, samsungPeer, message), lesson);
    assert.equal(samsung.signingKey.extractable, false);
});

test('a pasted offer requires an independently confirmed matching code', async () => {
    await assert.rejects(approvePeer(stranger.offer, samsung.pairingCode), /codes do not match/);
    await assert.rejects(approvePeer('garbage', samsung.pairingCode), /Invalid pairing message/);
});

test('a lesson cannot be sent to itself or accepted on an unrelated phone', async () => {
    await assert.rejects(signLesson(samsung, samsungPeer, lesson), /different device/);
    await assert.rejects(verifyLesson(stranger.id, samsungPeer, message), /addressed to this pairing/);
    await assert.rejects(verifyLesson(secondPhone.id, null, message), /does not have/);
});

test('revoked peers cannot send or receive another signed lesson', async () => {
    await assert.rejects(verifyLesson(secondPhone.id, revokePeer(samsungPeer), message), /does not have/);
    await assert.rejects(signLesson(samsung, revokePeer(secondPeer), lesson), /does not have/);
});

test('tampered content, substituted keys and oversized lessons are rejected', async () => {
    const fields = JSON.parse(message);
    fields[3] = 'tampered';
    await assert.rejects(verifyLesson(secondPhone.id, samsungPeer, JSON.stringify(fields)), /signature/);
    const impostor = { ...samsungPeer, publicKey: JSON.parse(stranger.offer)[1] };
    await assert.rejects(verifyLesson(secondPhone.id, impostor, message), /trusted device key/);
    await assert.rejects(signLesson(samsung, secondPeer, 'a'.repeat(2049)), /Invalid lesson data/);
});
