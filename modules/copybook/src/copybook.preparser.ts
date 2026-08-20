export const preprocessFixedCopybook = (
    source: string[],
): string[] => {
    const result =
        source.map(() => "");

    for (
        let index = 0;
        index < source.length;
        index++
    ) {
        const line =
            source[index];

        const indicator =
            line[6] ?? " ";

        const text =
            line
                .slice(7, 72)
                .trimEnd();

        if (
            indicator === "*" ||
            indicator === "/"
        )
            continue;

        if (indicator === "-") {
            const previousIndex =
                findPreviousSourceLine(
                    result,
                    index,
                );

            if (previousIndex === undefined) {
                result[index] =
                    text.trimStart();

                continue;
            }

            result[previousIndex] =
                result[previousIndex].trimEnd() +
                text.trimStart();

            continue;
        }

        result[index] =
            text;
    }

    return result;
};


const findPreviousSourceLine = (
    source: string[],
    before: number,
): number | undefined => {
    for (
        let index = before - 1;
        index >= 0;
        index--
    )
        if (source[index] !== "")
            return index;

    return undefined;
};