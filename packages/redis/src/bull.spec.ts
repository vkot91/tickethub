import { bullConnection } from './bull';

describe('bullConnection', () => {
  it('splits a redis URL into host and port', () => {
    expect(bullConnection('redis://cache:6380')).toEqual({ host: 'cache', port: 6380 });
  });

  it('defaults to 6379 when the URL omits a port', () => {
    expect(bullConnection('redis://localhost')).toEqual({ host: 'localhost', port: 6379 });
  });
});
