import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({ n: z.number() });

describe('ZodValidationPipe', () => {
  it('returns parsed value on valid input', () => {
    const pipe = new ZodValidationPipe(schema);
    expect(pipe.transform({ n: 1 })).toEqual({ n: 1 });
  });
  it('throws BadRequestException on invalid input', () => {
    const pipe = new ZodValidationPipe(schema);
    expect(() => pipe.transform({ n: 'x' })).toThrow(BadRequestException);
  });
});
