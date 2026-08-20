export function pathToValue(obj: Record<string, any>, path: string): any {
    return path.split('.').reduce((acc, key) => {
        if (acc && typeof acc === 'object') {
            return acc[key];
        }
        return undefined;
    }, obj);
}

type AnyObject = { [key: string]: any };

/**
 * Recursively retrieves all paths of keys in an object.
 *
 * @param obj - The object to traverse.
 * @param parentPath - The accumulated path from parent calls (used internally).
 * @returns An array of strings representing the paths to each leaf key.
 */
export function getAllConfigPaths(obj: AnyObject, parentPath: string = ''): string[] {
    let paths: string[] = [];

    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            // Construct the new path
            const currentPath = parentPath ? `${parentPath}.${key}` : key;
            const value = obj[key];

            // Check if the value is a non-null object and not an array
            if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                // Recursively get paths from the nested object
                paths = paths.concat(getAllConfigPaths(value, currentPath));
            } else {
                // It's a leaf node, add the path to the list
                paths.push(currentPath);
            }
        }
    }

    return paths;
}
