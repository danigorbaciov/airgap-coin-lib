import * as sodium from 'libsodium-wrappers'

import * as bs58check from '../../dependencies/src/bs58check-2.1.2'
import { CryptographyClient } from '../CryptographyClient'

export class TezosCryptographyClient extends CryptographyClient {
  constructor(public readonly edsigPrefix: Uint8Array = new Uint8Array([9, 245, 205, 134, 18])) {
    super()
  }

  public async signMessage(message: string, keypair: { privateKey: Buffer }): Promise<string> {
    await sodium.ready
    const rawSignature: Uint8Array = sodium.crypto_sign_detached(sodium.from_string(message), keypair.privateKey)
    const signature: string = bs58check.encode(Buffer.concat([Buffer.from(this.edsigPrefix), Buffer.from(rawSignature)]))

    return signature
  }

  public async verifyMessage(message: string, signature: string, publicKey: string): Promise<boolean> {
    await sodium.ready

    let rawSignature: Uint8Array
    if (signature.startsWith('edsig')) {
      const edsigPrefixLength: number = this.edsigPrefix.length
      const decoded: Buffer = bs58check.decode(signature)

      rawSignature = new Uint8Array(decoded.slice(edsigPrefixLength, decoded.length))
    } else {
      throw new Error(`invalid signature: ${signature}`)
    }

    const isValidSignature: boolean = sodium.crypto_sign_verify_detached(rawSignature, message, Buffer.from(publicKey, 'hex'))

    return isValidSignature
  }
}
