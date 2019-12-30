# node-symspell
JavaScript port of SymSpell 6.6 based on the [original C# version by Wolf Garde](https://github.com/wolfgarbe/SymSpell) and the [Python version by mammothb](https://github.com/mammothb/symspellpy).

Just like the Python version, this cuts out some of the C# memory optimisation which aren't really relevant in JavaScript. As a result, this port is not optimised for speed, though it's still quite fast.

This version also includes the additions of the Python version such as the `ignoreToken` and `transferCasing` options. The unit tests provided are those of the Python version which are much more comprehensive than the original ones.

This library uses the `iter-tools` and `difflib` modules which are Javascript ports of the Python modules with similar names. Because it uses async/await and async generators, it needs at least Node 12.x.

**NOTE: this is still a work in progress and the API is likely to change**

## Basic Example

```js
const SymSpell = require('node-symspell')

const maxEditDistance = 2
const prefixLength = 7
const symSpell = new SymSpell(maxEditDistance, prefixLength)
await symSpell.loadDictionary(dictionaryPath, 0, 1)
await symSpell.loadBigramDictionary(bigramPath, 0, 2)

const typo = 'Can yu readthis messa ge despite thehorible sppelingmsitakes'
const results = symSpell.lookupCompound(typo, maxEditDistance)

console.log(results[0])
// {
// 	term: 'can you read this message despite the horrible spelling mistakes',
// 	distance: 10,
// 	count: 0
// } 
```

## Main API overview

`constructor (maxDictionaryEditDistance = 2, prefixLength = 7, countThreshold = 1)`

`async loadDictionary (dictFile, termIndex, countIndex, separator = ' ')`

`async loadBigramDictionary (dictFile, termIndex, countIndex, separator = ' ')`

`lookup (input, verbosity, maxEditDistance = null, { includeUnknown, ignoreToken, transferCasing } = {})`

`lookupCompound (input, maxEditDistance = null, { ignoreNonWords, transferCasing } = {})`

`wordSegmentation (input, { maxEditDistance = null, maxSegmentationWordLength = null, ignoreToken } = {})`

## References

https://github.com/wolfgarbe/SymSpell  
https://github.com/mammothb/symspellpy