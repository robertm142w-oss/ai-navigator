const encoder = new TextEncoder();
const scheme = 'the-word:lesson:v1';
const offerScheme = 'the-word:device:v1';
const maxMessageLength = 8192;
const maxLessonLength = 2048;

function hex(bytes) {
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function decodeHex(value, byteLength) {
    if (typeof value !== 'string' || value.length !== byteLength * 2 || !/^[0-9a-f]+$/.test(value)) {
        throw new Error('Invalid pairing data.');
    }
    return Uint8Array.from(value.match(/../g), byte => Number.parseInt(byte, 16));
}

function parse(text, length) {
    if (typeof text !== 'string' || text.length > maxMessageLength) {
        throw new Error('Invalid pairing message.');
    }
    let fields;
    try {
        fields = JSON.parse(text);
    } catch {
        throw new Error('Invalid pairing message.');
    }
    if (!Array.isArray(fields) || fields.length !== length) {
        throw new Error('Invalid pairing message.');
    }
    return fields;
}

async function fingerprint(rawKey) {
    return hex(await crypto.subtle.digest('SHA-256', rawKey));
}

async function importPublicKey(rawKey) {
    return crypto.subtle.importKey('raw', rawKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
}

function checkLessonText(text) {
    if (typeof text !== 'string' || !text.trim() || text.length > maxLessonLength) {
        throw new Error('Invalid lesson data.');
    }
}

function displayCode(id) {
    return id.slice(0, 32).match(/.{4}/g).join(' ');
}

export async function createDeviceIdentity() {
    const keys = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign', 'verify']
    );
    const rawKey = await crypto.subtle.exportKey('raw', keys.publicKey);
    const id = await fingerprint(rawKey);
    return {
        id,
        offer: JSON.stringify([offerScheme, hex(rawKey)]),
        pairingCode: displayCode(id),
        signingKey: keys.privateKey
    };
}

export async function approvePeer(offer, codeReadFromOtherDevice) {
    const [type, publicKey] = parse(offer, 2);
    if (type !== offerScheme) throw new Error('Invalid pairing offer.');
    const rawKey = decodeHex(publicKey, 65);
    const id = await fingerprint(rawKey);
    if (codeReadFromOtherDevice !== displayCode(id)) {
        throw new Error('Pairing codes do not match.');
    }
    await importPublicKey(rawKey);
    return { id, publicKey, revoked: false };
}

export function revokePeer(peer) {
    return { ...peer, revoked: true };
}

function requireApprovedPeer(peer) {
    if (!peer || peer.revoked !== false) {
        throw new Error('This device does not have lesson-sharing access.');
    }
}

export async function signLesson(identity, peer, lessonText) {
    requireApprovedPeer(peer);
    checkLessonText(lessonText);
    if (identity.id === peer.id) throw new Error('Choose a different device.');
    const fields = [scheme, identity.id, peer.id, lessonText];
    const payload = encoder.encode(JSON.stringify(fields));
    const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' }, identity.signingKey, payload
    );
    const message = JSON.stringify([...fields, hex(signature)]);
    if (message.length > maxMessageLength) throw new Error('Lesson message is too long.');
    return message;
}

export async function verifyLesson(identityId, peer, message) {
    requireApprovedPeer(peer);
    const [type, from, to, lessonText, signature] = parse(message, 5);
    if (type !== scheme || from !== peer.id || from === to || to !== identityId) {
        throw new Error('This lesson is not addressed to this pairing.');
    }
    checkLessonText(lessonText);
    const rawKey = decodeHex(peer.publicKey, 65);
    if (await fingerprint(rawKey) !== peer.id) throw new Error('Invalid trusted device key.');
    const key = await importPublicKey(rawKey);
    const payload = encoder.encode(JSON.stringify([type, from, to, lessonText]));
    const verified = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' }, key, decodeHex(signature, 64), payload
    );
    if (!verified) throw new Error('The lesson signature could not be verified.');
    return lessonText;
}
