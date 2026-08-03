import '@testing-library/jest-dom/vitest';

import { afterEach } from 'vitest';

import { toast } from '@tickethub/ui';

// The toast store is a module singleton, so it outlives a test's unmount. Clear it between
// tests or a toast one spec fired shows up in the next one's queries.
afterEach(() => toast.remove());
