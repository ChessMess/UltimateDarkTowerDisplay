import { DEFAULT_PHYSICS, resolvePhysics } from '../../../src/physics/PhysicsResolver';

describe('resolvePhysics', () => {
  it('returns a deep-equal copy of DEFAULT_PHYSICS for an empty input', () => {
    expect(resolvePhysics({})).toEqual(DEFAULT_PHYSICS);
    expect(resolvePhysics(undefined)).toEqual(DEFAULT_PHYSICS);
  });

  it('does not mutate the inputs', () => {
    const frozen = Object.freeze({ drum: Object.freeze({ friction: 0.4 }) });
    expect(() => resolvePhysics(frozen)).not.toThrow();
    expect(frozen.drum.friction).toBe(0.4);
  });

  it('returns a fresh object — not the same reference as the base', () => {
    const out = resolvePhysics({});
    expect(out).not.toBe(DEFAULT_PHYSICS);
    expect(out.skull).not.toBe(DEFAULT_PHYSICS.skull);
  });

  it('honors a single overridden leaf and leaves the rest at defaults', () => {
    const out = resolvePhysics({ drum: { friction: 0.4 } });

    expect(out.drum.friction).toBe(0.4);
    expect(out.drum.innerRadiusFactor).toBe(DEFAULT_PHYSICS.drum.innerRadiusFactor);
    expect(out.drum.halfHeightFactor).toBe(DEFAULT_PHYSICS.drum.halfHeightFactor);
    expect(out.skull).toEqual(DEFAULT_PHYSICS.skull);
    expect(out.board).toEqual(DEFAULT_PHYSICS.board);
  });

  it('merges patches on top of a non-default base', () => {
    const base = resolvePhysics({ drum: { friction: 0.4 } });
    const out = resolvePhysics({ seal: { friction: 0.1 } }, base);

    expect(out.drum.friction).toBe(0.4);
    expect(out.seal.friction).toBe(0.1);
  });

  it('supports overrides in every domain', () => {
    const out = resolvePhysics({
      debug: { colliders: true },
      skull: { radiusFactor: 0.05, angularDamping: 2.5 },
      drum: { innerRadiusFactor: 0.4 },
      seal: { friction: 0.2 },
      static: { friction: 0.3 },
      board: { radiusFactor: 5, friction: 0.7 },
      oob: { depthFactor: 10 },
    });

    expect(out.debug.colliders).toBe(true);
    expect(out.debug.sealColliders).toBe(false);
    expect(out.skull.radiusFactor).toBe(0.05);
    expect(out.skull.angularDamping).toBe(2.5);
    expect(out.drum.innerRadiusFactor).toBe(0.4);
    expect(out.seal.friction).toBe(0.2);
    expect(out.static.friction).toBe(0.3);
    expect(out.board.radiusFactor).toBe(5);
    expect(out.board.friction).toBe(0.7);
    expect(out.oob.depthFactor).toBe(10);
  });

  it('preserves DEFAULT_PHYSICS as a stable reference', () => {
    const before = JSON.stringify(DEFAULT_PHYSICS);
    resolvePhysics({ board: { friction: 0.9 } });
    expect(JSON.stringify(DEFAULT_PHYSICS)).toBe(before);
  });
});
