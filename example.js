import SymSpell, { Verbosity } from './index.js'

const maxEditDistance = 2
const prefixLength = 7
const symSpell = new SymSpell(maxEditDistance, prefixLength)


const dictionaryPath = './dictionaries/frequency_dictionary_en_82_765.txt' // for spelling correction (genuine English words)
const bigramPath = './dictionaries/frequency_bigramdictionary_en_243_342.txt'



await symSpell.loadDictionary(dictionaryPath, 0, 1)
await symSpell.loadBigramDictionary(bigramPath, 0, 2)

const typo = 'Can yu readthis messa ge despite thehorible sppelingmsitakes'
const results = symSpell.lookupCompound(typo, maxEditDistance)

console.log(results[0])