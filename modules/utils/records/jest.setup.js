// jest.setup.js

function getDocDefinedBecauseInNodeJestEnvironemnt() {
    try {
        return document !== undefined;
    } catch (e) {
        return false;
    }
}

if (getDocDefinedBecauseInNodeJestEnvironemnt()) {
    const root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);
}

