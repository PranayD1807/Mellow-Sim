export const rand = (min, max) => Math.random() * (max - min) + min;

export const randInt = (min, max) => Math.floor(rand(min, max));

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

// Generates a random alphanumeric ID
export const generateId = () => Math.random().toString(36).substr(2, 9);

// --- Gendered name pools ---
const maleFirstNames = [
    "Aiden", "Blake", "Caleb", "Dane", "Ethan", "Felix", "Grant", "Hugo",
    "Ivan", "Jack", "Kai", "Leo", "Miles", "Noah", "Oscar", "Paul",
    "Reed", "Sam", "Troy", "Victor", "Wade", "Xander", "Yuri", "Zane",
    "Asher", "Brody", "Cole", "Drew", "Eli", "Finn", "Gavin", "Heath",
    "Joel", "Kyle", "Luke", "Max", "Nate", "Owen", "Pete", "Rhys"
];

const femaleFirstNames = [
    "Aria", "Bella", "Clara", "Diana", "Elena", "Fiona", "Grace", "Hannah",
    "Iris", "Julia", "Kira", "Luna", "Mia", "Nora", "Olivia", "Pearl",
    "Ruby", "Sofia", "Tara", "Uma", "Violet", "Wendy", "Xena", "Yara",
    "Zoe", "Amber", "Brynn", "Cleo", "Demi", "Elara", "Flora", "Gwen",
    "Hazel", "Ivy", "Jade", "Lily", "Maya", "Nina", "Opal", "Rose"
];

const surnames = [
    "Stone", "Frost", "Blaze", "Thorn", "Hawk", "Vale", "Storm", "Wolf",
    "Rain", "Ash", "Brook", "Crane", "Drake", "Elm", "Forge", "Glen",
    "Hart", "Ivy", "Knoll", "Lark", "Marsh", "Oak", "Pike", "Ridge",
    "Shaw", "Voss", "Wren", "York", "Birch", "Clay", "Dale", "Fern"
];

const usedNames = new Set();

export const generateName = (gender) => {
    const pool = gender === 'Male' ? maleFirstNames : femaleFirstNames;
    let attempts = 0;
    while (attempts < 200) {
        const first = pool[randInt(0, pool.length)];
        const last = surnames[randInt(0, surnames.length)];
        const fullName = `${first} ${last}`;
        if (!usedNames.has(fullName)) {
            usedNames.add(fullName);
            return fullName;
        }
        attempts++;
    }
    // Fallback with ID
    const fallback = `${pool[randInt(0, pool.length)]} #${generateId().substring(0, 4)}`;
    usedNames.add(fallback);
    return fallback;
};

export const clearAllNames = () => {
    usedNames.clear();
};
