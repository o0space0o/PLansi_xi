import { makeField } from './volume-density.js';
self.onmessage = ({ data: { kind, size, token } }) => {
  const field = makeField(kind, size);
  self.postMessage({ field, size, token }, [field.buffer]);
};
