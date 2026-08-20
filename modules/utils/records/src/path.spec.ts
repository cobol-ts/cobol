import { getAllConfigPaths, pathToValue } from "./path";

describe('pathToValue', () => {
    test('retrieves nested value', () => {
        const data = { a: { b: { c: 42 } } };
        expect(pathToValue(data, 'a.b.c')).toBe(42);
    });

    test('returns undefined for missing path', () => {
        const data = { a: { b: {} } };
        expect(pathToValue(data, 'a.b.c')).toBeUndefined();
    });

    test('handles null values', () => {
        const data = { a: { b: null } };
        expect(pathToValue(data, 'a.b')).toBeNull();
        expect(pathToValue(data, 'a.b.c')).toBeUndefined();
    });

    test('returns undefined for non-existing root key', () => {
        const data = { a: {} };
        expect(pathToValue(data, 'x.y.z')).toBeUndefined();
    });

    test('retrieves object when path is partial', () => {
        const data = { a: { b: { c: 42 } } };
        expect(pathToValue(data, 'a.b')).toEqual({ c: 42 });
        expect(pathToValue(data, 'a')).toEqual({ b: { c: 42 } });
    });

    test('handles empty object', () => {
        expect(pathToValue({}, 'a.b.c')).toBeUndefined();
    });

    test('handles null object', () => {
        expect(pathToValue(null as any, 'a.b.c')).toBeUndefined();
    });
});

describe('getAllPaths', () => {
    test('should return correct paths for a simple nested object', () => {
        const obj = {
            a: {
                b: {
                    c: [],
                },
                d: 1,
            },
        };

        const expected = ['a.b.c', 'a.d'];
        const result = getAllConfigPaths(obj);
        expect(result).toEqual(expected);
    });

    test('should handle flat objects', () => {
        const obj = {
            x: 10,
            y: 20,
            z: 30,
        };

        const expected = ['x', 'y', 'z'];
        const result = getAllConfigPaths(obj);
        expect(result).toEqual(expected);
    });

    test('should handle empty objects', () => {
        const obj = {};

        const expected: string[] = [];
        const result = getAllConfigPaths(obj);
        expect(result).toEqual(expected);
    });

    test('should handle nested objects with multiple levels', () => {
        const obj = {
            user: {
                profile: {
                    name: 'Alice',
                    address: {
                        street: '123 Main St',
                        city: 'Wonderland',
                    },
                },
                preferences: {
                    notifications: true,
                },
            },
            isActive: false,
        };

        const expected = [
            'user.profile.name',
            'user.profile.address.street',
            'user.profile.address.city',
            'user.preferences.notifications',
            'isActive',
        ];
        const result = getAllConfigPaths(obj);
        expect(result).toEqual(expected);
    });

    test('should handle objects with null and undefined values', () => {
        const obj = {
            a: null,
            b: undefined,
            c: {
                d: null,
                e: 5,
            },
        };

        const expected = ['a', 'b', 'c.d', 'c.e'];
        const result = getAllConfigPaths(obj);
        expect(result).toEqual(expected);
    });

    test('should treat arrays as leaf nodes', () => {
        const obj = {
            a: [1, 2, 3],
            b: {
                c: ['x', 'y'],
            },
        };

        const expected = ['a', 'b.c'];
        const result = getAllConfigPaths(obj);
        expect(result).toEqual(expected);
    });

    test('should handle mixed data types', () => {
        const obj = {
            num: 42,
            str: 'hello',
            bool: true,
            obj: {
                nestedNum: 100,
            },
            arr: [1, { deep: 'value' }],
        };

        const expected = ['num', 'str', 'bool', 'obj.nestedNum', 'arr'];
        const result = getAllConfigPaths(obj);
        expect(result).toEqual(expected);
    });
});