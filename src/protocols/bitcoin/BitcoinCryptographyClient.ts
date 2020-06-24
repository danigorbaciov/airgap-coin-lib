import * as bitcoinJSMessage from 'bitcoinjs-message'

import { ICoinProtocol } from '../..'
import { CryptographyClient } from '../CryptographyClient'

export class BitcoinCryptographyClient extends CryptographyClient {
  constructor(private readonly protocol: ICoinProtocol) {
    super()
  }

  public async signMessage(message: string, keypair: { privateKey: Buffer }): Promise<string> {
    const signature: Buffer = bitcoinJSMessage.sign(message, keypair.privateKey, true)

    return signature.toString('base64')
  }

  public async verifyMessage(message: string, signature: string, publicKey: string): Promise<boolean> {
    const rawSignature: Buffer = Buffer.from(signature, 'base64')

    const address: string = await this.protocol.getAddressFromPublicKey(publicKey)

    return bitcoinJSMessage.verify(message, address, rawSignature)
  }
}
