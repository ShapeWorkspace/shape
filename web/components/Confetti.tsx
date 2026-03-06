import * as styles from "../styles/confetti.css"

/**
 * Confetti burst animation component.
 * Renders 8 particles that burst outward from center, used for task completion celebration.
 */
export function Confetti() {
  return (
    <div className={styles.confettiContainer}>
      <div className={`${styles.particle} ${styles.particle0}`} />
      <div className={`${styles.particle} ${styles.particle1}`} />
      <div className={`${styles.particle} ${styles.particle2}`} />
      <div className={`${styles.particle} ${styles.particle3}`} />
      <div className={`${styles.particle} ${styles.particle4}`} />
      <div className={`${styles.particle} ${styles.particle5}`} />
      <div className={`${styles.particle} ${styles.particle6}`} />
      <div className={`${styles.particle} ${styles.particle7}`} />
    </div>
  )
}
