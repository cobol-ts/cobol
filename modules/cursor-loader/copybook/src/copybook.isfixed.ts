const fixedFormatIndicators = [
    " ",
    "*",
    "/",
    "-",
];


export const isFixedFormatCopybook = (
    source: string[],
): boolean => {
    const lines =
        source.filter(
            line =>
                line.trim() !== "",
        );

    if (lines.length === 0)
        return false;

    if (
        !lines.every(
            isPossibleFixedFormatLine,
        )
    )
        return false;

    return lines.some(
        hasStrongFixedFormatEvidence,
    );
};


const isPossibleFixedFormatLine = (
    line: string,
): boolean => {
    if (line.length < 7)
        return false;

    const sequenceArea =
        line.slice(0, 6);

    const indicator =
        line[6];

    return (
        isValidSequenceArea(
            sequenceArea,
        ) &&
        fixedFormatIndicators.includes(
            indicator,
        )
    );
};


const isValidSequenceArea = (
    sequenceArea: string,
): boolean =>
    /^ {6}$/.test(sequenceArea) ||
    /^\d{6}$/.test(sequenceArea);


const hasStrongFixedFormatEvidence = (
    line: string,
): boolean => {
    const sequenceArea =
        line.slice(0, 6);

    const indicator =
        line[6];

    return (
        /^\d{6}$/.test(
            sequenceArea,
        ) ||
        indicator === "*" ||
        indicator === "/" ||
        indicator === "-"
    );
};