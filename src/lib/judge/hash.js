import { createHash } from 'node:crypto';

export const referenceHash = (source) => createHash('sha256').update(source).digest('hex').slice(0, 16);
