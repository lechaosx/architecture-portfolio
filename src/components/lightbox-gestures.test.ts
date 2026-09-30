import { describe, expect, test } from 'bun:test';
import {
  LightboxGestures,
  type GestureContext,
  type GestureIntent,
} from './lightbox-gestures';
import type { Point } from './gallery';

const rest: GestureContext = {
  view: { scale: 1, pan: { x: 0, y: 0 } },
  range: { min: 1, max: 4 },
  flipped: false,
};
const zoomed: GestureContext = {
  ...rest,
  view: { scale: 2, pan: { x: 10, y: 0 } },
};
const onText: GestureContext = { ...rest, flipped: true };
const at = (x: number, y = 0): Point => ({ x, y });
const claim: GestureIntent = { type: 'claim' };
const drag = (offset: number): GestureIntent => ({ type: 'drag', offset });
const settle: GestureIntent = { type: 'settle' };
const grab: GestureIntent = { type: 'grab', grabbing: true };
const letGo: GestureIntent = { type: 'grab', grabbing: false };
const commit = (direction: 1 | -1): GestureIntent => ({
  type: 'commit',
  direction,
});
const turn = (offset: number): GestureIntent => ({ type: 'turn', offset });
const turnBack: GestureIntent = { type: 'turnBack' };
const keepText: GestureIntent = { type: 'keepText' };

/** One finger down at `from` and up at `to`, `time` ms into the test. */
function tap(
  gestures: LightboxGestures,
  from: Point,
  to: Point,
  time: number,
  context = rest,
) {
  gestures.touchStart([from], false, context);
  return gestures.touchEnd([], [to], time, context);
}

describe('a mouse drag', () => {
  test('at rest follows the pointer and past 50 px changes image the way it moved', () => {
    const gestures = new LightboxGestures();
    expect(gestures.mouseDown(at(0), rest)).toEqual([
      claim,
      grab,
      drag(0),
    ]);
    expect(gestures.mouseMove(at(-30, 5), rest)).toEqual([drag(-30)]);
    expect(gestures.mouseMove(at(-60, 5), rest)).toEqual([drag(-60)]);
    expect(gestures.mouseUp()).toEqual([letGo, commit(1)]);

    gestures.mouseDown(at(0), rest);
    gestures.mouseMove(at(80, 10), rest);
    expect(gestures.mouseUp()).toEqual([letGo, commit(-1)]);
  });

  test('changes image from exactly 50 px and settles short of it or mostly vertically', () => {
    const gestures = new LightboxGestures();
    gestures.mouseDown(at(0), rest);
    gestures.mouseMove(at(-50), rest);
    expect(gestures.mouseUp()).toEqual([letGo, commit(1)]);

    gestures.mouseDown(at(0), rest);
    gestures.mouseMove(at(49), rest);
    expect(gestures.mouseUp()).toEqual([letGo, settle]);

    gestures.mouseDown(at(0), rest);
    gestures.mouseMove(at(-80, 100), rest);
    expect(gestures.mouseUp()).toEqual([letGo, settle]);
  });

  test('on a zoomed drawing pans from where it was gripped and ends without a change', () => {
    const gestures = new LightboxGestures();
    expect(gestures.mouseDown(at(100, 100), zoomed)).toEqual([
      claim,
      grab,
    ]);
    expect(gestures.mouseMove(at(130, 90), zoomed)).toEqual([
      { type: 'view', scale: 2, pan: { x: 40, y: -10 } },
    ]);
    expect(gestures.mouseUp()).toEqual([letGo]);
  });

  test('on the text side is left to text selection, whatever the drawing zoom', () => {
    const gestures = new LightboxGestures();
    expect(gestures.mouseDown(at(0), onText)).toEqual([]);
    expect(gestures.mouseDown(at(0), { ...zoomed, flipped: true })).toEqual([]);
    expect(gestures.mouseMove(at(-80), onText)).toEqual([]);
    expect(gestures.mouseUp()).toEqual([]);
  });

  test('cancelled by the browser settles', () => {
    const gestures = new LightboxGestures();
    gestures.mouseDown(at(0), rest);
    gestures.mouseMove(at(-80), rest);
    expect(gestures.mouseCancel()).toEqual([letGo, settle]);
    expect(gestures.mouseCancel()).toEqual([]);
  });
});

describe('a one-finger touch', () => {
  test('at rest swipes, claiming its moves, and past the threshold changes image', () => {
    const gestures = new LightboxGestures();
    expect(gestures.touchStart([at(0)], false, rest)).toEqual([drag(0)]);
    expect(gestures.touchMove([at(-100, 2)], false, rest)).toEqual([
      claim,
      drag(-100),
    ]);
    expect(gestures.touchEnd([], [at(-100, 2)], 0, rest)).toEqual([commit(1)]);
  });

  test('changes image from exactly 50 px and settles short of it', () => {
    const gestures = new LightboxGestures();
    gestures.touchStart([at(0)], false, rest);
    gestures.touchMove([at(50)], false, rest);
    expect(gestures.touchEnd([], [at(50)], 0, rest)).toEqual([commit(-1)]);

    gestures.touchStart([at(0)], false, rest);
    gestures.touchMove([at(-49)], false, rest);
    expect(gestures.touchEnd([], [at(-49)], 1000, rest)).toEqual([settle]);
  });

  test('on a zoomed drawing pans', () => {
    const gestures = new LightboxGestures();
    expect(gestures.touchStart([at(0)], false, zoomed)).toEqual([]);
    expect(gestures.touchMove([at(-20, 30)], false, zoomed)).toEqual([
      claim,
      { type: 'view', scale: 2, pan: { x: -10, y: 30 } },
    ]);
    expect(gestures.touchEnd([], [at(-20, 30)], 0, zoomed)).toEqual([]);
  });

  test('on the text turns the card back, and claims a move, only while more horizontal than vertical', () => {
    const gestures = new LightboxGestures();
    expect(gestures.touchStart([at(0)], false, onText)).toEqual([turn(0)]);
    expect(gestures.touchMove([at(-40, 10)], false, onText)).toEqual([
      claim,
      turn(-40),
    ]);
    expect(gestures.touchMove([at(-40, -60)], false, onText)).toEqual([
      turn(0),
    ]);
    expect(gestures.touchEnd([], [at(-40, -60)], 0, onText)).toEqual([
      keepText,
    ]);
  });

  test('on the text past 50 px either way completes the turn, and short of it keeps the text', () => {
    const gestures = new LightboxGestures();
    gestures.touchStart([at(0)], false, onText);
    gestures.touchMove([at(-50, 5)], false, onText);
    expect(gestures.touchEnd([], [at(-50, 5)], 0, onText)).toEqual([
      turnBack,
    ]);

    gestures.touchStart([at(0)], false, onText);
    gestures.touchMove([at(120, -20)], false, onText);
    expect(gestures.touchEnd([], [at(120, -20)], 1000, onText)).toEqual([
      turnBack,
    ]);

    gestures.touchStart([at(0)], false, onText);
    gestures.touchMove([at(-49)], false, onText);
    expect(gestures.touchEnd([], [at(-49)], 2000, onText)).toEqual([
      keepText,
    ]);
  });

  test('on the text turns the card at any drawing zoom', () => {
    const gestures = new LightboxGestures();
    expect(
      gestures.touchStart([at(0)], false, { ...zoomed, flipped: true }),
    ).toEqual([turn(0)]);
  });

  test('does not drag while text is selected', () => {
    const gestures = new LightboxGestures();
    expect(gestures.touchStart([at(0)], true, onText)).toEqual([]);
    expect(gestures.touchMove([at(-100)], true, onText)).toEqual([]);

    gestures.touchStart([at(0)], false, onText);
    gestures.touchMove([at(-40)], false, onText);
    expect(gestures.touchMove([at(-80)], true, onText)).toEqual([keepText]);
    expect(gestures.touchMove([at(-120)], false, onText)).toEqual([]);
  });

  test('is ended by a native scroll of the text', () => {
    const gestures = new LightboxGestures();
    gestures.touchStart([at(0)], false, onText);
    gestures.touchMove([at(-10, 40)], false, onText);
    expect(gestures.textScrolled()).toEqual([keepText]);
    expect(gestures.touchMove([at(-200, 40)], false, onText)).toEqual([]);
    expect(gestures.touchEnd([], [at(-200, 40)], 0, onText)).toEqual([]);
    expect(gestures.textScrolled()).toEqual([]);
  });

  test('cancelled by the browser settles', () => {
    const gestures = new LightboxGestures();
    gestures.touchStart([at(0)], false, rest);
    gestures.touchMove([at(-80)], false, rest);
    expect(gestures.touchCancel()).toEqual([settle]);
  });

  test('ends when a third finger arrives, and the fingers then do nothing', () => {
    const gestures = new LightboxGestures();
    gestures.touchStart([at(0)], false, rest);
    gestures.touchMove([at(-80)], false, rest);
    expect(gestures.touchStart([at(-80), at(0), at(40)], false, rest)).toEqual([
      settle,
    ]);
    expect(gestures.touchMove([at(-120), at(0), at(40)], false, rest)).toEqual(
      [],
    );
    expect(gestures.touchEnd([], [at(-120)], 0, rest)).toEqual([]);
  });

});

describe('a pinch', () => {
  test('zooms by the finger distance within the zoom range', () => {
    const gestures = new LightboxGestures();
    const range = { min: 0.7, max: 4 };
    const context = { ...rest, range };
    expect(gestures.touchStart([at(-50), at(50)], false, context)).toEqual(
      [],
    );
    const scaleAt = (distance: number) =>
      (
        gestures.touchMove(
          [at(-distance / 2), at(distance / 2)],
          false,
          context,
        )[1] as {
          scale: number;
        }
      ).scale;
    expect(scaleAt(250)).toBe(2.5);
    expect(scaleAt(1000)).toBe(4);
    expect(scaleAt(10)).toBe(0.7);
  });

  test('from two fingers on one point keeps the scale', () => {
    const gestures = new LightboxGestures();
    gestures.touchStart([at(0), at(0)], false, rest);
    expect(gestures.touchMove([at(-50), at(50)], false, rest)).toEqual([
      claim,
      { type: 'view', scale: 1, pan: { x: 0, y: 0 } },
    ]);
  });

  test('keeps its starting image point beneath the moving midpoint', () => {
    const gestures = new LightboxGestures();
    gestures.touchStart([at(50, -50), at(150, -50)], false, rest);
    expect(
      gestures.touchMove([at(20, -40), at(220, -40)], false, rest),
    ).toEqual([claim, { type: 'view', scale: 2, pan: { x: -80, y: 60 } }]);
  });

  test('then leaves a zoomed drawing panning under the remaining finger', () => {
    const gestures = new LightboxGestures();
    gestures.touchStart([at(-50), at(50)], false, rest);
    gestures.touchMove([at(-100), at(100)], false, rest);
    expect(gestures.touchEnd([at(100)], [at(-100)], 0, zoomed)).toEqual([]);
    expect(gestures.touchMove([at(130, 20)], false, zoomed)).toEqual([
      claim,
      { type: 'view', scale: 2, pan: { x: 40, y: 20 } },
    ]);
  });

  test('takes over a one-finger drag, which settles', () => {
    const gestures = new LightboxGestures();
    gestures.touchStart([at(0)], false, rest);
    gestures.touchMove([at(-60)], false, rest);
    expect(gestures.touchStart([at(-60), at(40)], false, rest)).toEqual([
      settle,
    ]);
    expect(gestures.touchEnd([], [at(-60), at(40)], 0, rest)).toEqual([]);
  });

  test('that ends at rest leaves the remaining finger idle', () => {
    const gestures = new LightboxGestures();
    gestures.touchStart([at(-50), at(50)], false, rest);
    expect(gestures.touchEnd([at(50)], [at(-50)], 0, rest)).toEqual([]);
    expect(gestures.touchMove([at(-100)], false, rest)).toEqual([]);
  });

  test('does not happen on the text; a second finger ends the drag', () => {
    const gestures = new LightboxGestures();
    gestures.touchStart([at(0)], false, onText);
    gestures.touchMove([at(-60)], false, onText);
    expect(gestures.touchStart([at(-60), at(40)], false, onText)).toEqual([
      keepText,
    ]);
    expect(gestures.touchMove([at(-100), at(80)], false, onText)).toEqual([]);
  });
});

describe('a double tap', () => {
  test('zooms in to 2.5 or the ceiling at the tap, and a zoomed one returns to rest', () => {
    const gestures = new LightboxGestures();
    expect(tap(gestures, at(40, 20), at(42, 21), 1000)).toEqual([settle]);
    expect(tap(gestures, at(45, 22), at(45, 22), 1200)).toEqual([
      claim,
      settle,
      { type: 'zoom', scale: 2.5, point: at(45, 22) },
    ]);

    const low = { ...rest, range: { min: 1, max: 1.6 } };
    tap(gestures, at(0), at(0), 2000, low);
    expect(tap(gestures, at(0), at(0), 2100, low).at(-1)).toEqual({
      type: 'zoom',
      scale: 1.6,
      point: at(0),
    });

    expect(tap(gestures, at(0), at(0), 3000, zoomed)).toEqual([]);
    expect(tap(gestures, at(0), at(0), 3100, zoomed)).toEqual([
      claim,
      { type: 'zoom', scale: 1, point: at(0) },
    ]);
  });

  test('needs two short taps within 300 ms and 30 px', () => {
    const slow = new LightboxGestures();
    tap(slow, at(0), at(0), 1000);
    expect(tap(slow, at(0), at(0), 1300)).toEqual([settle]);

    const apart = new LightboxGestures();
    tap(apart, at(0), at(0), 1000);
    expect(tap(apart, at(30), at(30), 1100)).toEqual([settle]);

    const moved = new LightboxGestures();
    tap(moved, at(0), at(0), 1000);
    expect(tap(moved, at(0), at(10), 1100)).toEqual([settle]);
  });

  test('starts afresh after it zooms', () => {
    const gestures = new LightboxGestures();
    tap(gestures, at(0), at(0), 1000);
    tap(gestures, at(0), at(0), 1100);
    expect(tap(gestures, at(0), at(0), 1200)).toEqual([settle]);
  });

  test('does not zoom on the text', () => {
    const gestures = new LightboxGestures();
    tap(gestures, at(0), at(0), 1000, onText);
    expect(tap(gestures, at(0), at(0), 1100, onText)).toEqual([keepText]);
  });
});

describe('the wheel and double-click', () => {
  test('the wheel zooms about the pointer within the zoom range', () => {
    const gestures = new LightboxGestures();
    const [, zoom] = gestures.wheel(-100, at(30, -20), rest) as [
      GestureIntent,
      { type: 'zoom'; scale: number; point: Point },
    ];
    expect(zoom.scale).toBeCloseTo(Math.exp(0.2));
    expect(zoom.point).toEqual(at(30, -20));
    expect(
      gestures.wheel(-100, at(0), {
        ...rest,
        view: { ...rest.view, scale: 4 },
      }),
    ).toEqual([claim, { type: 'zoom', scale: 4, point: at(0) }]);
    expect(
      gestures.wheel(1000, at(0), { ...rest, range: { min: 0.7, max: 4 } }),
    ).toEqual([claim, { type: 'zoom', scale: 0.7, point: at(0) }]);
  });

  test('on the text the wheel is left to scroll it', () => {
    expect(new LightboxGestures().wheel(-100, at(0), onText)).toEqual([]);
  });

  test('the wheel does not zoom during a drag at rest', () => {
    const dragging = new LightboxGestures();
    dragging.mouseDown(at(0), rest);
    expect(dragging.wheel(-100, at(0), rest)).toEqual([claim]);
  });

  test('double-click does not zoom during a drag at rest', () => {
    const dragging = new LightboxGestures();
    dragging.touchStart([at(0)], false, rest);
    expect(dragging.doubleClick(at(0), rest)).toEqual([]);
  });

  test('double-click zooms in at the pointer and back to rest', () => {
    const gestures = new LightboxGestures();
    expect(gestures.doubleClick(at(5, 6), rest)).toEqual([
      { type: 'zoom', scale: 2.5, point: at(5, 6) },
    ]);
    expect(gestures.doubleClick(at(5, 6), zoomed)).toEqual([
      { type: 'zoom', scale: 1, point: at(5, 6) },
    ]);
    const below = {
      ...rest,
      view: { ...rest.view, scale: 0.8 },
      range: { min: 0.7, max: 4 },
    };
    expect(gestures.doubleClick(at(5, 6), below)).toEqual([
      { type: 'zoom', scale: 1, point: at(5, 6) },
    ]);
    expect(gestures.doubleClick(at(0), onText)).toEqual([]);
  });
});

describe('zoom keys', () => {
  test('step by 1.25 about the centre within the zoom range, and reset to rest', () => {
    const gestures = new LightboxGestures();
    const centre = at(0);
    expect(gestures.key('in', rest)).toEqual([
      claim,
      { type: 'zoom', scale: 1.25, point: centre },
    ]);
    expect(gestures.key('out', zoomed)).toEqual([
      claim,
      { type: 'zoom', scale: 1.6, point: centre },
    ]);
    expect(gestures.key('out', rest)).toEqual([
      claim,
      { type: 'zoom', scale: 1, point: centre },
    ]);
    const top = { ...rest, view: { ...rest.view, scale: 4 } };
    expect(gestures.key('in', top)).toEqual([
      claim,
      { type: 'zoom', scale: 4, point: centre },
    ]);
    expect(gestures.key('reset', zoomed)).toEqual([
      claim,
      { type: 'zoom', scale: 1, point: centre },
    ]);
  });

  test('do nothing on the text or during a drag at rest', () => {
    expect(new LightboxGestures().key('in', onText)).toEqual([]);
    const mouse = new LightboxGestures();
    mouse.mouseDown(at(0), rest);
    mouse.mouseMove(at(-30), rest);
    expect(mouse.key('in', rest)).toEqual([]);
    const touch = new LightboxGestures();
    touch.touchStart([at(0)], false, rest);
    expect(touch.key('reset', rest)).toEqual([]);
  });

  test('still zoom while a zoomed drawing is panned', () => {
    const gestures = new LightboxGestures();
    gestures.mouseDown(at(0), zoomed);
    expect(gestures.key('reset', zoomed)).toEqual([
      claim,
      { type: 'zoom', scale: 1, point: at(0) },
    ]);
  });
});

describe('a change of image', () => {
  test('ends the mouse drag in progress, which then does nothing', () => {
    const gestures = new LightboxGestures();
    gestures.mouseDown(at(0), rest);
    gestures.mouseMove(at(-30), rest);
    expect(gestures.end()).toEqual([letGo]);
    expect(gestures.mouseMove(at(-120), rest)).toEqual([]);
    expect(gestures.mouseUp()).toEqual([]);
  });

  test('ends the touch drag in progress, which then does nothing', () => {
    const gestures = new LightboxGestures();
    gestures.touchStart([at(0)], false, rest);
    gestures.touchMove([at(-30)], false, rest);
    expect(gestures.end()).toEqual([]);
    expect(gestures.touchMove([at(-120)], false, rest)).toEqual([]);
    expect(gestures.touchEnd([], [at(-120)], 0, rest)).toEqual([]);
  });
});
