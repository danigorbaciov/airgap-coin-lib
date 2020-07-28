const bs58grscheck = require('../bs58grscheck-2.1.2/index')
const bech32 = require('../bech32-1.1.3/index')
const bufferEquals = require('../buffer-equals-1.0.4/index')
const createHash = require('../create-hash-1.2.0/browser')
const secp256k1 = require('../secp256k1-3.7.1/elliptic')
const varuint = require('../varuint-bitcoin-1.1.2/index')

const SEGWIT_TYPES = {
  P2WPKH: 'p2wpkh',
  P2SH_P2WPKH: 'p2sh(p2wpkh)'
}

function sha256 (b) {
  return createHash('sha256')
    .update(b)
    .digest()
}
function hash160 (buffer) {
  return createHash('ripemd160')
    .update(sha256(buffer))
    .digest()
}

function encodeSignature (signature, recovery, compressed, segwitType) {
  if (segwitType !== undefined) {
    recovery += 8
    if (segwitType === SEGWIT_TYPES.P2WPKH) recovery += 4
  } else {
    if (compressed) recovery += 4
  }
  return Buffer.concat([Buffer.alloc(1, recovery + 27), signature])
}

/**
  Electrum signs segwit messages as if they were compressed
*/

function encodeSignatureElectrum (signature, recovery, compressed, segwitType) {
  if (segwitType !== undefined) {
    recovery += 4
  } else {
    if (compressed) recovery += 4
  }
  return Buffer.concat([Buffer.alloc(1, recovery + 27), signature])
}

function decodeSignature (buffer) {
  if (buffer.length !== 65) throw new Error('Invalid signature length')

  const flagByte = buffer.readUInt8(0) - 27
  if (flagByte > 15 || flagByte < 0) {
    throw new Error('Invalid signature parameter')
  }

  return {
    compressed: !!(flagByte & 12),
    segwitType: !(flagByte & 8)
      ? null
      : !(flagByte & 4)
        ? SEGWIT_TYPES.P2SH_P2WPKH
        : SEGWIT_TYPES.P2WPKH,
    recovery: flagByte & 3,
    signature: buffer.slice(1)
  }
}

function magicHash (message, messagePrefix) {
  messagePrefix = messagePrefix || '\u001CGroestlCoin Signed Message:\n'
  if (!Buffer.isBuffer(messagePrefix)) {
    messagePrefix = Buffer.from(messagePrefix, 'utf8')
  }

  const messageVISize = varuint.encodingLength(message.length)
  const buffer = Buffer.allocUnsafe(
    messagePrefix.length + messageVISize + message.length
  )
  messagePrefix.copy(buffer, 0)
  varuint.encode(message.length, buffer, messagePrefix.length)
  buffer.write(message, messagePrefix.length + messageVISize)
  return sha256(buffer)
}

function sign (
  message,
  privateKey,
  compressed,
  messagePrefix,
  sigOptions
) {
  if (typeof messagePrefix === 'object' && sigOptions === undefined) {
    sigOptions = messagePrefix
    messagePrefix = undefined
  }
  let { segwitType, extraEntropy } = sigOptions || {}
  if (
    segwitType &&
    (typeof segwitType === 'string' || segwitType instanceof String)
  ) {
    segwitType = segwitType.toLowerCase()
  }
  if (
    segwitType &&
    segwitType !== SEGWIT_TYPES.P2SH_P2WPKH &&
    segwitType !== SEGWIT_TYPES.P2WPKH
  ) {
    throw new Error(
      'Unrecognized segwitType: use "' +
        SEGWIT_TYPES.P2SH_P2WPKH +
        '" or "' +
        SEGWIT_TYPES.P2WPKH +
        '"'
    )
  }
  const hash = magicHash(message, messagePrefix)
  const sigObj = secp256k1.sign(hash, privateKey, { data: extraEntropy })
  return encodeSignature(
    sigObj.signature,
    sigObj.recovery,
    compressed,
    segwitType
  )
}

function signElectrum (
  message,
  privateKey,
  compressed,
  messagePrefix,
  sigOptions
) {
  if (typeof messagePrefix === 'object' && sigOptions === undefined) {
    sigOptions = messagePrefix
    messagePrefix = undefined
  }
  let { segwitType, extraEntropy } = sigOptions || {}
  if (
    segwitType &&
    (typeof segwitType === 'string' || segwitType instanceof String)
  ) {
    segwitType = segwitType.toLowerCase()
  }
  if (
    segwitType &&
    segwitType !== SEGWIT_TYPES.P2SH_P2WPKH &&
    segwitType !== SEGWIT_TYPES.P2WPKH
  ) {
    throw new Error(
      'Unrecognized segwitType: use "' +
        SEGWIT_TYPES.P2SH_P2WPKH +
        '" or "' +
        SEGWIT_TYPES.P2WPKH +
        '"'
    )
  }
  const hash = magicHash(message, messagePrefix)
  const sigObj = secp256k1.sign(hash, privateKey, { data: extraEntropy })
  return encodeSignatureElectrum(
    sigObj.signature,
    sigObj.recovery,
    compressed,
    segwitType
  )
}

function verify (message, address, signature, messagePrefix) {
  if (!Buffer.isBuffer(signature)) signature = Buffer.from(signature, 'base64')

  const parsed = decodeSignature(signature)
  const hash = magicHash(message, messagePrefix)
  const publicKey = secp256k1.recover(
    hash,
    parsed.signature,
    parsed.recovery,
    parsed.compressed
  )
  const publicKeyHash = hash160(publicKey)
  let actual, expected

  if (parsed.segwitType) {
    if (parsed.segwitType === SEGWIT_TYPES.P2SH_P2WPKH) {
      const redeemScript = Buffer.concat([
        Buffer.from('0014', 'hex'),
        publicKeyHash
      ])
      const redeemScriptHash = hash160(redeemScript)
      actual = redeemScriptHash
      expected = bs58grscheck.decode(address).slice(1)
    } else if (parsed.segwitType === SEGWIT_TYPES.P2WPKH) {
      const result = bech32.decode(address)
      const data = bech32.fromWords(result.words.slice(1))
      actual = publicKeyHash
      expected = Buffer.from(data)
    }
  } else {
    actual = publicKeyHash
    expected = bs58grscheck.decode(address).slice(1)
  }

  return bufferEquals(actual, expected)
}

function verifyElectrum (message, address, signature, messagePrefix) {
  if (!Buffer.isBuffer(signature)) signature = Buffer.from(signature, 'base64')

  const parsed = decodeSignature(signature)
  const hash = magicHash(message, messagePrefix)
  const publicKey = secp256k1.recover(
    hash,
    parsed.signature,
    parsed.recovery,
    parsed.compressed
  )
  const publicKeyHash = hash160(publicKey)
  let actual, expected

  try {
    const expectedHash160 = bs58grscheck.decode(address).slice(1)
    // first check if this hash is the same as the publicKeyHash
    // validate if it is P2PKH (starts with F)
    if (bufferEquals(publicKeyHash, expectedHash160)) {
      return true
    }
    // check if it is a segwit P2SH_P2WPKH address (starts with 3)
    const redeemScript = Buffer.concat([
      Buffer.from('0014', 'hex'),
      publicKeyHash
    ])
    const redeemScriptHash = Buffer.from(hash160(redeemScript))
    return bufferEquals(redeemScriptHash, expectedHash160)
  } catch (e) {
    const result = bech32.decode(address)
    const data = bech32.fromWords(result.words.slice(1))
    actual = publicKeyHash
    expected = Buffer.from(data)
    return bufferEquals(actual, expected)
  }
}

module.exports = {
  magicHash: magicHash,
  sign: sign,
  verify: verify,
  signElectrum: signElectrum,
  verifyElectrum: verifyElectrum
}
