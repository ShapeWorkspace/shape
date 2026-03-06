/**
 * Builds the associated data string for user key bundle encryption/decryption.
 *
 * Associated data binds ciphertext to the user's normalized email and bundle ID,
 * preventing ciphertext transplant between accounts or bundles.
 */
export class BuildUserKeyBundleAssociatedData {
  /**
   * Format: shape:v1:user:<email>:-:-:keybundle:<bundleId>
   */
  public execute(emailAddress: string, bundleId: string): string {
    const normalizedEmailAddress = emailAddress.toLowerCase().trim()

    return `shape:v1:user:${normalizedEmailAddress}:-:-:keybundle:${bundleId}`
  }
}
