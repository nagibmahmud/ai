const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'script.js');
let content = fs.readFileSync(filePath, 'utf8');

// Replace all problematic template literals with regular strings
// Remove emojis from template literals in response generators

const emojiPattern = /[\u{1F300}-\u{1F9FF}]|\u200D/gu;

// Find and fix all generate*Response functions
const functionPattern = /(generate\w+Response\([^)]*\)\s*\{\s*return\s*)`([^`]*?)`(\s*;?\s*\})/gs;

content = content.replace(functionPattern, (match, prefix, template, suffix) => {
    // Remove emojis from the template
    const cleaned = template.replace(emojiPattern, '');
    return `${prefix}\`${cleaned}\`${suffix}`;
});

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed emoji issues in template literals');
