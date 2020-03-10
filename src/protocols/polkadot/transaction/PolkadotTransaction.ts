import { PolkadotTransactionMethod } from "./method/PolkadotTransactionMethod"
import BigNumber from "../../../dependencies/src/bignumber.js-9.0.0/bignumber"
import { PolkadotSignature, PolkadotSignatureType } from "./PolkadotSignature"
import { IAirGapTransaction } from "../../../interfaces/IAirGapTransaction"
import { SCALEClass } from "../codec/type/SCALEClass"
import { SCALECompactInt } from "../codec/type/SCALECompactInt"
import { SCALEEra, EraConfig } from "../codec/type/SCALEEra"
import { SCALEType } from "../codec/type/SCALEType"
import { SCALEBytes } from "../codec/type/SCALEBytes"
import { ExtrinsicId } from "../metadata/Metadata"
import { SCALEDecoder } from "../codec/SCALEDecoder"
import { SCALEHash } from "../codec/type/SCALEHash"
import { stripHexPrefix } from "../../../utils/hex"
import { RawPolkadotTransaction } from "../../../serializer/types"
import { SCALEAccountId } from "../codec/type/SCALEAccountId"

const VERSION = 4
const BIT_SIGNED = 128
const BIT_UNSIGNED = 128 // TODO: change to 0 if payment_queryInfo regocnizes the transaction, at the moment it returns "No such variant in enum Call" error

interface PolkadotTransactionConfig {
    from: string,
    args: any,
    tip: number | BigNumber,
    methodId: ExtrinsicId,
    era: EraConfig | null,
    nonce: number | BigNumber,
    signature?: string | Uint8Array | Buffer
}

export enum PolkadotTransactionType {
    TRANSFER, BOND, UNBOND, NOMINATE, STOP_NOMINATING
}

export class PolkadotTransaction extends SCALEClass {
    public static create(type: PolkadotTransactionType, config: PolkadotTransactionConfig): PolkadotTransaction {
        return new PolkadotTransaction(
            type,
            SCALEAccountId.from(config.from), 
            PolkadotSignature.create(PolkadotSignatureType.Sr25519, config.signature), 
            config.era ? SCALEEra.Mortal(config.era) : SCALEEra.Immortal(),
            SCALECompactInt.from(config.nonce),
            SCALECompactInt.from(config.tip), 
            PolkadotTransactionMethod.create(type, config.methodId.moduleIndex, config.methodId.callIndex, config.args)
        )
    }

    public static fromTransaction(transaction: PolkadotTransaction, config?: Partial<PolkadotTransactionConfig>): PolkadotTransaction {
        return new PolkadotTransaction(
            transaction.type,
            (config && config.from) ? SCALEAccountId.from(config.from) : transaction.signer,
            PolkadotSignature.create(transaction.signature.type.value, config ? config.signature : undefined),
            (config && config.era) ? SCALEEra.Mortal(config.era) : transaction.era,
            (config && config.nonce) ? SCALECompactInt.from(config.nonce) : transaction.nonce,
            (config && config.tip) ? SCALECompactInt.from(config.tip) : transaction.tip,
            (config && config.args && config.methodId) 
                ? PolkadotTransactionMethod.create(transaction.type, config.methodId.moduleIndex, config.methodId.callIndex, config.args) 
                : transaction.method
        )
    }

    public static fromRaw(raw: RawPolkadotTransaction): PolkadotTransaction {
        return PolkadotTransaction.decode(PolkadotTransactionType[PolkadotTransactionType[parseInt(raw.type, 10)]], raw.encoded)
    }

    public static decode(type: PolkadotTransactionType, raw: string): PolkadotTransaction {
        const bytes = SCALEBytes.decode(stripHexPrefix(raw))
        const decoder = new SCALEDecoder(bytes.decoded.bytes.toString('hex'))

        decoder.decodeNextHash(8) // signed byte
        const signer = decoder.decodeNextAccountId()
        const signature = decoder.decodeNextObject(PolkadotSignature.decode)
        const era = decoder.decodeNextEra()
        const nonce = decoder.decodeNextCompactInt()
        const tip = decoder.decodeNextCompactInt()
        const method = decoder.decodeNextObject(hex => PolkadotTransactionMethod.decode(type, hex))

        return new PolkadotTransaction(
            type,
            signer.decoded,
            signature.decoded,
            era.decoded,
            nonce.decoded,
            tip.decoded,
            method.decoded
        )
    }

    protected scaleFields = [this.signer, this.signature, this.era, this.nonce, this.tip, this.method]

    private constructor(
        readonly type: PolkadotTransactionType,
        readonly signer: SCALEAccountId,
        readonly signature: PolkadotSignature,
        readonly era: SCALEEra,
        readonly nonce: SCALECompactInt,
        readonly tip: SCALECompactInt,
        readonly method: PolkadotTransactionMethod,
    ) { super() }

    public toString(): string {
        return JSON.stringify({
            type: PolkadotTransactionType[this.type],
            signer: this.signer.toString(),
            signature: JSON.parse(this.signature.toString()),
            era: JSON.parse(this.era.toString()),
            nonce: this.nonce.toNumber(),
            tip: this.tip.toNumber(),
            method: JSON.parse(this.method.toString())
        }, null, 2)
    }

    public toAirGapTransaction(): Partial<IAirGapTransaction> {
        return {
            from: [this.signer.asAddress()],
            to: [this.signer.asAddress()],
            transactionDetails: JSON.parse(this.toString()),
            ...this.method.toAirGapTransactionPart()
        }
    }

    protected _encode(): string {
        const typeEncoded = SCALEHash.from(new Uint8Array([VERSION | (this.signature.isSigned ? BIT_SIGNED : BIT_UNSIGNED)])).encode()
        const bytes = Buffer.from(typeEncoded + this.scaleFields.reduce((encoded: string, struct: SCALEType) => encoded + struct.encode(), ''), 'hex')

        return SCALEBytes.from(bytes).encode()
    }
}