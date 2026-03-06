Initializers are run-once bootstrapping units.

- They are invoked during workspace startup.
- They are not long-lived like processes.
- Every initializer must extend `RunOnceInitializer` and cannot execute more than once.
