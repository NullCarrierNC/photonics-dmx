// DOM matchers (toBeInTheDocument, toBeDisabled, ...) for every renderer suite. The jest-globals
// entry point, because the suites import `expect` from '@jest/globals' and only this build extends
// that expect and declares its types.
import '@testing-library/jest-dom/jest-globals'
