import { Crypto } from "../../crypto/crypto"
import { KDF_CONTEXT, KDF_V1_PARAMS } from "../../crypto/constants"
import { LoginChallengeResponse } from "../../models/auth-types"
import { LoginDerivedKeys } from "../../models/auth-types"
import { SUBKEY_ID_PW_KEK } from "../../crypto/constants"
import { SUBKEY_ID_SERVER_PASSWORD } from "../../crypto/constants"

/**
 * Derives authentication keys from a raw password and server-provided KDF parameters.
 *
 * The derived keys are:
 * - serverPassword: sent to the server for authentication
 * - pwKek: retained client-side to decrypt the key bundle
 */
export class DeriveLoginKeysFromPasswordAndChallenge {
  constructor(private readonly crypto: Crypto) {}

  public execute(password: string, challengeResponse: LoginChallengeResponse): LoginDerivedKeys {
    // Determine KDF parameters based on protocol version.
    const resolvedKdfParams = this.resolveKdfParamsForVersion(challengeResponse.kdf_version)

    // Argon2id derives a master key from the raw password and server-provided salt.
    const masterKey = this.crypto.argon2(
      password,
      challengeResponse.pw_salt,
      resolvedKdfParams.opsLimit,
      resolvedKdfParams.memLimit,
      resolvedKdfParams.outputBytes
    )

    // Derive separate subkeys so authentication and encryption never share the same key bytes.
    const passwordKeyEncryptionKey = this.crypto.sodiumCryptoKdfDeriveFromKey(
      masterKey,
      SUBKEY_ID_PW_KEK,
      32,
      KDF_CONTEXT
    )
    const serverPassword = this.crypto.sodiumCryptoKdfDeriveFromKey(
      masterKey,
      SUBKEY_ID_SERVER_PASSWORD,
      32,
      KDF_CONTEXT
    )

    return {
      serverPassword,
      pwKek: passwordKeyEncryptionKey,
    }
  }

  /**
   * Resolves protocol-specific KDF parameters.
   *
   * Unknown versions intentionally fall back to v1 to avoid breaking logins
   * while allowing the server to phase-in future versions.
   */
  private resolveKdfParamsForVersion(version: number) {
    if (version === KDF_V1_PARAMS.version) {
      return KDF_V1_PARAMS
    }

    return KDF_V1_PARAMS
  }
}
