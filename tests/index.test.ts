import { isObservable, of, Subscription } from 'rxjs';
import { filter, map, scan } from 'rxjs/operators';
import { proxify } from '../src';

describe('Proxify', () => {
    let sub: Subscription;
    let observer: {
        next: jest.Mock;
        error: jest.Mock;
        complete: jest.Mock;
    };

    beforeEach(() => {
        observer = {
            next: jest.fn(),
            error: jest.fn(),
            complete: jest.fn(),
        };
    });

    afterEach(() => {
        if (sub){
            sub.unsubscribe();
        }
    })

    describe('Observable API', () => {
        test('isObservable should be true', () => {
            const o = of({ a: 1 }, { a: 2 }, { a: 3 });
            const p = proxify(o);
            expect(isObservable(p)).toBe(true);
        });

        test('directly applying operator', () => {
            const o = of(1, 2, 3);
            const p = proxify(o);
            const mapped = map((x: number) => x + '.')(p);
            expect(isObservable(mapped)).toBe(true);
            sub = mapped.subscribe(observer);
            expect(observer.next.mock.calls).toEqual([['1.'], ['2.'], ['3.']]);
            expect(observer.complete.mock.calls.length).toBe(1);
        })

        test('piping operator', () => {
            const o = of(1, 2, 3);
            const p = proxify(o);
            const mapped = p.pipe(map(x => x + '.'));
            expect(isObservable(mapped)).toBe(true);
            sub = mapped.subscribe(observer);
            expect(observer.next.mock.calls).toEqual([['1.'], ['2.'], ['3.']]);
            expect(observer.complete.mock.calls.length).toBe(1);
        })
    })

    describe('Pluck', () => {
        test('One level', () => {
            const o = of({ a: 1 }, { a: 2 }, { a: 3 });
            const p = proxify(o);
            sub = p.a.subscribe(observer);
            expect(observer.next.mock.calls).toEqual([[1], [2], [3]]);
            expect(observer.complete.mock.calls.length).toBe(1);
        });

        test('One level w/ pipe', () => {
            const o = of({ a: 1 }, { a: 2 }, { a: 3 });
            const p = proxify(o);
            sub = p.pipe(filter((x) => x.a > 1)).a.subscribe(observer);
            expect(observer.next.mock.calls).toEqual([[2], [3]]);
            expect(observer.complete.mock.calls.length).toBe(1);
        });

        test('Two levels', () => {
            const o = of({ a: { b: 1 } }, { a: { b: 2 } }, { a: { b: 3 } });
            const p = proxify(o);
            sub = p.a.b.subscribe(observer);
            expect(observer.next.mock.calls).toEqual([[1], [2], [3]]);
            expect(observer.complete.mock.calls.length).toBe(1);
        });

        test('Two levels w/ pipe', () => {
            const o = of(
                { a: { b: 1, ok: true } },
                { a: { b: 2, ok: false } },
                { a: { b: 3, ok: true } },
            );
            const p = proxify(o);
            sub = p.a.pipe(filter((x) => x.ok)).b.subscribe(observer);
            expect(observer.next.mock.calls).toEqual([[1], [3]]);
            expect(observer.complete.mock.calls.length).toBe(1);
        });
    });

    describe('Calls', () => {
        test('One level', () => {
            const o = of({ a: () => 1 }, { a: () => 2 }, { a: () => 3 });
            const p = proxify(o);
            sub = p.a().subscribe(observer);
            expect(observer.next.mock.calls).toEqual([[1], [2], [3]]);
            expect(observer.complete.mock.calls.length).toBe(1);
        });

        it('should keep the THIS context', () => {
            const a = function () {
                return this.b;
            };
            const o = of({ a, b: 1 }, { a, b: 2 }, { a, b: 3 });
            const p = proxify(o);
            sub = p.a().subscribe(observer);
            expect(observer.next.mock.calls).toEqual([[1], [2], [3]]);
            expect(observer.complete.mock.calls.length).toBe(1);
        });

        it('should pass the args', () => {
            const a = (x: number, y: number) => x + y;
            const o = of({ a }, { a }, { a });
            const p = proxify(o);
            sub = p.a(1, 1).subscribe(observer);
            expect(observer.next.mock.calls).toEqual([[2], [2], [2]]);
            expect(observer.complete.mock.calls.length).toBe(1);
        });

        it('should call proxify on result', () => {
            const a = (x: number, y: number) => ({ b: x + y });
            const o = of({ a }, { a }, { a });
            const p = proxify(o);
            sub = p.a(1, 1)
                .b.pipe(scan((acc, curr) => acc + curr))
                .subscribe(observer);
            expect(observer.next.mock.calls).toEqual([[2], [4], [6]]);
            expect(observer.complete.mock.calls.length).toBe(1);
        });

        it('should return same Proxy for each property access', () => {
            const o = of({ a: 42 });
            const p = proxify(o);
            expect(p.a === p.a).toBe(true);
        });

        // TS:
        // proxify(fn)() -- should be Proxify
        test('Fn call result should be of type Proxify', () => {
            const o = of(() => 'Hello', () => 'World');
            const p = proxify(o);
            // fn call
            p().subscribe((s: string) => observer.next(s));
            expect(observer.next).toHaveBeenCalledWith('Hello');
            expect(observer.next).toHaveBeenCalledWith('World');
            observer.next.mockClear();
            // mapped
            p.pipe(map(f => f())).subscribe(observer);
            expect(observer.next).toHaveBeenCalledWith('Hello');
            expect(observer.next).toHaveBeenCalledWith('World');
        });

        // TYPES: proxify(of('a', 'b')).length -- should be Proxify
        // test('elemental types should be Proxify', () => {
        //     const o = of('Hello', 'World');
        //     const p = proxify(o);
        //     p.length.subscribe(console.log);
        // });

        // This test fails on typecheck due to `a` being
        //     (x: any, y: any) => { b: any }
        // any type on b seem to corrupt further typings
        // TODO: improve typings
        // it('should call proxify on result w/ any', () => {
        //     const a = (x: any, y: any) => ({ b: x + y });
        //     const o = of({ a }, { a }, { a });
        //     const p = proxify(o);
        //     p.a(1, 1).b.subscribe(observer);
        //     expect(observer.next.mock.calls).toEqual([[1], [2], [3]])
        //     expect(observer.complete.mock.calls.length).toBe(1);
        // });
    });
});
