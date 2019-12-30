const fs = require('fs')
const readline = require('readline')
const itertools = require('iter-tools')

const Code = require('@hapi/code')
const Lab = require('@hapi/lab')
const SymSpell = require('../index')
const Helpers = require('../helpers')
const EditDistance = require('../edit-distance')

const { permutations, combinations } = itertools
const { expect } = Code
const { it, experiment, before } = exports.lab = Lab.script()

const getTestStrings = () => {
	const alphabet = 'abcd'
	const strings = ['']

	for (let i = 1; i < alphabet.length + 1; i++) {
		for (const combi of combinations(alphabet, i)) {
			strings.push(Array.from(permutations(combi)).map((p) => p).join(''))
		}
	}

	return strings
}

const getDamerauOsa = (string1, string2, maxDistance) => {
	maxDistance = Math.min(Number.maxSafeInteger, maxDistance)
	const len1 = string1.length
	const len2 = string2.length

	const d = []
	let distance = -1

	for (let i = 0; i < len1 + 1; i++) {
		d.push([])

		for (let j = 0; j < len2 + 1; j++) {
			d[i].push(0)
		}
	}

	for (let i = 0; i < len1 + 1; i++) {
		d[i][0] = i
	}

	for (let j = 0; j < len2 + 1; j++) {
		d[0][j] = j
	}

	for (let i = 1; i < len1 + 1; i++) {
		for (let j = 1; j < len2 + 1; j++) {
			const cost = string1[i - 1] === string2[j - 1] ? 0 : 1
			d[i][j] = Math.min(Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1), d[i - 1][j - 1] + cost)

			if (i > 1 && j > 1 && string1[i - 1] === string2[j - 2] && string1[i - 2] === string2[j - 1]) {
				d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost)
				distance = d[len1][len2]
			}
		}
	}

	return distance <= maxDistance ? distance : -1
}

experiment('symspell', () => {
	let testStrings = []
	const dictionaryPath = './dictionaries/frequency_dictionary_en_82_765.txt' // for spelling correction (genuine English words)
	const bigramPath = './dictionaries/frequency_bigramdictionary_en_243_342.txt'

	before(() => {
		testStrings = getTestStrings()
	})

	it('testTransferCasingForMatchingText', () => {
		const textWCasing = 'Haw is the eeather in New York?'
		const textWoCasing = 'how is the weather in new york?'
		const textWoCasingTransferred = 'How is the weather in New York?'

		expect(Helpers.transferCasingMatching(textWCasing, textWoCasing)).to.equal(textWoCasingTransferred)
	})

	it('testTransferCasingForSimilarText', () => {
		const textWCasing = 'Haaw is the weeather in New York?'
		const textWoCasing = 'how is the weather in new york?'
		const textWoCasingTransferred = 'How is the weather in New York?'

		expect(Helpers.transferCasingSimilar(textWCasing, textWoCasing)).to.equal(textWoCasingTransferred)
	})

	it('testDamerauOsaMatchRefMax0', () => {
		const maxDistance = 0
		const comparer = new EditDistance()

		testStrings.forEach((s1) => {
			testStrings.forEach((s2) => {
				expect(getDamerauOsa(s1, s2, maxDistance), comparer.distance(s1, s2, maxDistance))
			})
		})
	})

	it('testDamerauOsaMatchRefMax1', () => {
		const maxDistance = 1
		const comparer = new EditDistance()

		testStrings.forEach((s1) => {
			testStrings.forEach((s2) => {
				expect(getDamerauOsa(s1, s2, maxDistance), comparer.distance(s1, s2, maxDistance))
			})
		})
	})

	it('testDamerauOsaMatchRefMax3', () => {
		const maxDistance = 3
		const comparer = new EditDistance()

		testStrings.forEach((s1) => {
			testStrings.forEach((s2) => {
				expect(getDamerauOsa(s1, s2, maxDistance), comparer.distance(s1, s2, maxDistance))
			})
		})
	})

	it('testDamerauOsaMatchRefMaxHuge', () => {
		const maxDistance = Number.maxSafeInteger
		const comparer = new EditDistance()

		testStrings.forEach((s1) => {
			testStrings.forEach((s2) => {
				expect(getDamerauOsa(s1, s2, maxDistance), comparer.distance(s1, s2, maxDistance))
			})
		})
	})

	it('testDamerauOsaNullDistance', () => {
		const maxDistance = 10
		const shortString = 'string'
		const longString = 'long-string'
		const comparer = new EditDistance()

		let distance = comparer.distance(shortString, null, maxDistance)
		expect(distance).to.equal(shortString.length)

		distance = comparer.distance(longString, null, maxDistance)
		expect(distance).to.equal(-1)

		distance = comparer.distance(null, shortString, maxDistance)
		expect(distance).to.equal(shortString.length)

		distance = comparer.distance(null, longString, maxDistance)
		expect(distance).to.equal(-1)

		distance = comparer.distance(null, null, maxDistance)
		expect(distance).to.equal(0)
	})

	it('testDamerauOsaNegativeMaxDistance', () => {
		const maxDistance1 = 0
		const shortString = 'string'
		const longString = 'long-string'
		const comparer = new EditDistance()

		let distance = comparer.distance(shortString, null, maxDistance1)
		expect(distance).to.equal(-1)

		distance = comparer.distance(longString, null, maxDistance1)
		expect(distance).to.equal(-1)

		distance = comparer.distance(null, shortString, maxDistance1)
		expect(distance).to.equal(-1)

		distance = comparer.distance(null, longString, maxDistance1)
		expect(distance).to.equal(-1)

		distance = comparer.distance(null, null, maxDistance1)
		expect(distance).to.equal(0)

		distance = comparer.distance(shortString, shortString, maxDistance1)

		expect(distance).to.equal(0)

		const maxDistance2 = -1
		distance = comparer.distance(shortString, null, maxDistance2)
		expect(distance).to.equal(-1)

		distance = comparer.distance(longString, null, maxDistance2)
		expect(distance).to.equal(-1)

		distance = comparer.distance(null, shortString, maxDistance2)
		expect(distance).to.equal(-1)

		distance = comparer.distance(null, longString, maxDistance2)
		expect(distance).to.equal(-1)

		distance = comparer.distance(null, null, maxDistance2)
		expect(distance).to.equal(0)

		distance = comparer.distance(shortString, shortString, maxDistance2)

		expect(distance).to.equal(0)
	})

	it('testDamerauOsaVeryLongString2', () => {
		const maxDistance = 5
		const shortString = 'string'
		const veryLongString = 'veryLongString'
		const comparer = new EditDistance()

		const distance = comparer.distance(shortString, veryLongString, maxDistance)

		expect(distance).to.equal(-1)
	})

	it('WordsWithSharedPrefixShouldRetainCounts', () => {
		const symSpell = new SymSpell(1, 3)
		symSpell.createDictionaryEntry('pipe', 5)
		symSpell.createDictionaryEntry('pips', 10)

		let result = symSpell.lookup('pipe', SymSpell.Verbosity.ALL, 1)

		expect(result.length).to.equal(2)
		expect(result[0].term).to.equal('pipe')
		expect(result[0].count).to.equal(5)
		expect(result[1].term).to.equal('pips')
		expect(result[1].count).to.equal(10)

		result = symSpell.lookup('pips', SymSpell.Verbosity.ALL, 1)

		expect(result.length).to.equal(2)
		expect(result[0].term).to.equal('pips')
		expect(result[0].count).to.equal(10)
		expect(result[1].term).to.equal('pipe')
		expect(result[1].count).to.equal(5)

		result = symSpell.lookup('pip', SymSpell.Verbosity.ALL, 1)

		expect(result.length).to.equal(2)
		expect(result[0].term).to.equal('pips')
		expect(result[0].count).to.equal(10)
		expect(result[1].term).to.equal('pipe')
		expect(result[1].count).to.equal(5)
	})

	it('AddAdditionalCountsShouldNotAddWordAgain', () => {
		const symSpell = new SymSpell()
		const word = 'hello'
		symSpell.createDictionaryEntry(word, 11)
		expect(1, symSpell.wordCount)
		symSpell.createDictionaryEntry(word, 3)
		expect(1, symSpell.wordCount)
	})

	it('AddAdditionalCountsShouldIncreaseCount', () => {
		const symSpell = new SymSpell()
		const word = 'hello'
		symSpell.createDictionaryEntry(word, 11)
		let result = symSpell.lookup(word, SymSpell.Verbosity.TOP)

		let count = 0
		if (result.length === 1) count = result[0].count
		expect(11, count)
		symSpell.createDictionaryEntry(word, 3)
		result = symSpell.lookup(word, SymSpell.Verbosity.TOP)

		count = 0
		if (result.length === 1) count = result[0].count
		expect(11 + 3, count)
	})

	it('AddAdditionalCountsShouldNotOverflow', () => {
		const symSpell = new SymSpell()
		const word = 'hello'
		symSpell.createDictionaryEntry(word, Number.maxSafeInteger - 10)
		let result = symSpell.lookup(word, SymSpell.Verbosity.TOP)

		let count = 0
		if (result.length === 1) count = result[0].count
		expect(Number.maxSafeInteger - 10, count)
		symSpell.createDictionaryEntry(word, 11)
		result = symSpell.lookup(word, SymSpell.Verbosity.TOP)

		count = 0
		if (result.length === 1) count = result[0].count
		expect(Number.maxSafeInteger, count)
	})

	it('VerbosityShouldControlLookupResults', () => {
		const symSpell = new SymSpell()
		symSpell.createDictionaryEntry('steam', 1)
		symSpell.createDictionaryEntry('steams', 2)
		symSpell.createDictionaryEntry('steem', 3)

		let result = symSpell.lookup('steems', SymSpell.Verbosity.TOP, 2)

		expect(result.length).to.equal(1)
		result = symSpell.lookup('steems', SymSpell.Verbosity.CLOSEST, 2)

		expect(result.length).to.equal(2)
		result = symSpell.lookup('steems', SymSpell.Verbosity.ALL, 2)

		expect(result.length).to.equal(3)
	})

	it('LookupShouldReturnMostFrequent', () => {
		const symSpell = new SymSpell()
		symSpell.createDictionaryEntry('steama', 4)
		symSpell.createDictionaryEntry('steamb', 6)
		symSpell.createDictionaryEntry('steamc', 2)
		const result = symSpell.lookup('steam', SymSpell.Verbosity.TOP, 2)

		expect(result.length).to.equal(1)
		expect(result[0].term).to.equal('steamb')
		expect(result[0].count).to.equal(6)
	})

	it('LookupShouldFindExactMatch', () => {
		const symSpell = new SymSpell()
		symSpell.createDictionaryEntry('steama', 4)
		symSpell.createDictionaryEntry('steamb', 6)
		symSpell.createDictionaryEntry('steamc', 2)
		const result = symSpell.lookup('steama', SymSpell.Verbosity.TOP, 2)

		expect(result.length).to.equal(1)
		expect(result[0].term).to.equal('steama')
	})

	it('LookupShouldNotReturnNonWordDelete', () => {
		const symSpell = new SymSpell(2, 7, 10)
		symSpell.createDictionaryEntry('pawn', 10)
		let result = symSpell.lookup('paw', SymSpell.Verbosity.TOP, 0)

		result = symSpell.lookup('awn', SymSpell.Verbosity.TOP, 0)

		expect(result.length).to.equal(0)
	})

	it('LookupShouldNotReturnLowCountWord', () => {
		const symSpell = new SymSpell(2, 7, 10)
		symSpell.createDictionaryEntry('pawn', 1)
		const result = symSpell.lookup('pawn', SymSpell.Verbosity.TOP, 0)

		expect(result.length).to.equal(0)
	})

	it('LookupShouldNotReturnLowCountWordThatsAlsoDeleteWord', () => {
		const symSpell = new SymSpell(2, 7, 10)
		symSpell.createDictionaryEntry('flame', 20)
		symSpell.createDictionaryEntry('flam', 1)
		const result = symSpell.lookup('flam', SymSpell.Verbosity.TOP, 0)

		expect(result.length).to.equal(0)
	})

	it('LookupShouldReplicateNoisyResults', async () => {
		const maxEditDistance = 2
		const prefixLength = 7
		const verbosity = SymSpell.Verbosity.CLOSEST
		const symSpell = new SymSpell(maxEditDistance, prefixLength)

		await symSpell.loadDictionary(dictionaryPath, 0, 1)

		// load 1000 terms with random spelling errors
		const testList = []
		const lines = readline.createInterface({
			input: fs.createReadStream('./test/data/noisy_query_en_1000.txt', 'utf8'),
			output: process.stdout,
			terminal: false
		})

		for await (const line of lines) {
			const lineParts = line.trim().split(' ')

			if (lineParts.length >= 2) {
				testList.push(lineParts[0])
			}
		}

		let resultSum = 0

		for (let i = 0; i < testList.length; i++) {
			const c = symSpell.lookup(testList[i], verbosity, symSpell.maxDictionaryEditDistance)
			resultSum += c.length
		}

		expect(resultSum).to.equal(4945)
	})

	it('LookupCompound', async () => {
		const maxEditDistance = 2
		const prefixLength = 7
		const symSpell = new SymSpell(maxEditDistance, prefixLength)
		await symSpell.loadDictionary(dictionaryPath, 0, 1)
		await symSpell.loadBigramDictionary(bigramPath, 0, 2)

		let typo = 'whereis th elove'
		let correction = 'where is the love'
		let results = symSpell.lookupCompound(typo, maxEditDistance)
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)
		expect(results[0].distance).to.equal(2)
		expect(results[0].count).to.equal(585)

		typo = 'the bigjest playrs'
		correction = 'the biggest players'
		results = symSpell.lookupCompound(typo, maxEditDistance)
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)
		expect(results[0].distance).to.equal(2)
		expect(results[0].count).to.equal(34)

		typo = 'Can yu readthis'
		correction = 'can you read this'
		results = symSpell.lookupCompound(typo, maxEditDistance)
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)
		expect(results[0].distance).to.equal(3)
		expect(results[0].count).to.equal(11440)

		typo = "whereis th elove hehad dated forImuch of thepast who couqdn'tread in sixthgrade and ins pired him"
		correction = "where is the love he had dated for much of the past who couldn't read in sixth grade and inspired him"
		results = symSpell.lookupCompound(typo, maxEditDistance)
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)
		expect(results[0].distance).to.equal(9)
		expect(results[0].count).to.equal(0)

		typo = 'in te dhird qarter oflast jear he hadlearned ofca sekretplan'
		correction = 'in the third quarter of last year he had learned of a secret plan'
		results = symSpell.lookupCompound(typo, maxEditDistance)
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)
		expect(results[0].distance).to.equal(9)
		expect(results[0].count).to.equal(0)

		typo = 'the bigjest playrs in te strogsommer film slatew ith plety of funn'
		correction = 'the biggest players in the strong summer film slate with plenty of fun'
		results = symSpell.lookupCompound(typo, maxEditDistance)
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)
		expect(results[0].distance).to.equal(9)
		expect(results[0].count).to.equal(0)

		typo = 'Can yu readthis messa ge despite thehorible sppelingmsitakes'
		correction = 'can you read this message despite the horrible spelling mistakes'
		results = symSpell.lookupCompound(typo, maxEditDistance)
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)
		expect(results[0].distance).to.equal(10)
		expect(results[0].count).to.equal(0)
	})

	it('testLookupCompoundNoBigram', async () => {
		const maxEditDistance = 2
		const prefixLength = 7
		const symSpell = new SymSpell(maxEditDistance, prefixLength)
		await symSpell.loadDictionary(dictionaryPath, 0, 1)

		let typo = 'whereis th elove'
		let correction = 'whereas the love'
		let results = symSpell.lookupCompound(typo, maxEditDistance)
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)
		expect(results[0].distance).to.equal(2)
		expect(results[0].count).to.equal(64)

		typo = 'the bigjest playrs'
		correction = 'the biggest players'
		results = symSpell.lookupCompound(typo, maxEditDistance)
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)
		expect(results[0].distance).to.equal(2)
		expect(results[0].count).to.equal(34)

		typo = 'Can yu readthis'
		correction = 'can you read this'
		results = symSpell.lookupCompound(typo, maxEditDistance)
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)
		expect(results[0].distance).to.equal(3)
		expect(results[0].count).to.equal(3)

		typo = "whereis th elove hehad dated forImuch of thepast who couqdn'tread in sixthgrade and ins pired him"
		correction = "whereas the love head dated for much of the past who couldn't read in sixth grade and inspired him"
		results = symSpell.lookupCompound(typo, maxEditDistance)
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)
		expect(results[0].distance).to.equal(9)
		expect(results[0].count).to.equal(0)

		typo = 'in te dhird qarter oflast jear he hadlearned ofca sekretplan'
		correction = 'in the third quarter of last year he had learned of a secret plan'
		results = symSpell.lookupCompound(typo, maxEditDistance)
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)
		expect(results[0].distance).to.equal(9)
		expect(results[0].count).to.equal(0)

		typo = 'the bigjest playrs in te strogsommer film slatew ith plety of funn'
		correction = 'the biggest players in the strong summer film slate with plenty of fun'
		results = symSpell.lookupCompound(typo, maxEditDistance)
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)
		expect(results[0].distance).to.equal(9)
		expect(results[0].count).to.equal(0)

		typo = 'Can yu readthis messa ge despite thehorible sppelingmsitakes'
		correction = 'can you read this message despite the horrible spelling mistakes'
		results = symSpell.lookupCompound(typo, maxEditDistance)
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)
		expect(results[0].distance).to.equal(10)
		expect(results[0].count).to.equal(0)
	})

	it('testLookupCompoundOnlyCombi', () => {
		const maxEditDistance = 2
		const prefixLength = 7
		const symSpell = new SymSpell(maxEditDistance, prefixLength)
		symSpell.createDictionaryEntry('steam', 1)
		symSpell.createDictionaryEntry('machine', 1)

		const typo = 'ste am machie'
		const correction = 'steam machine'
		const results = symSpell.lookupCompound(typo, maxEditDistance)
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)
	})

	it('testLookupCompoundNoSuggestion', () => {
		const maxEditDistance = 2
		const prefixLength = 7
		const symSpell = new SymSpell(maxEditDistance, prefixLength)
		symSpell.createDictionaryEntry('steam', 1)
		symSpell.createDictionaryEntry('machine', 1)

		const typo = 'qwer erty ytui a'
		const results = symSpell.lookupCompound(typo, maxEditDistance)
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(typo)
	})

	it('testLookupCompoundIgnoreNonWords', async () => {
		const maxEditDistance = 2
		const prefixLength = 7
		const symSpell = new SymSpell(maxEditDistance, prefixLength)
		await symSpell.loadDictionary(dictionaryPath, 0, 1)
		await symSpell.loadBigramDictionary(bigramPath, 0, 2)

		let typo = "whereis th elove 123 hehad dated forImuch of THEPAST who couqdn'tread in SIXTHgrade and ins pired him"
		let correction = "where is the love 123 he had dated for much of THEPAST who couldn't read in sixth grade and inspired him"
		let results = symSpell.lookupCompound(typo, maxEditDistance, { ignoreNonWords: true })
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)

		typo = 'in te DHIRD 1 qarter oflast jear he hadlearned ofca sekretplan'
		correction = 'in the DHIRD 1 quarter of last year he had learned of a secret plan'
		results = symSpell.lookupCompound(typo, maxEditDistance, { ignoreNonWords: true })
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)

		typo = 'the bigjest playrs in te stroGSOmmer film slatew ith PLETY of 12 funn'
		correction = 'the biggest players in the strong summer film slate with PLETY of 12 fun'
		results = symSpell.lookupCompound(typo, maxEditDistance, { ignoreNonWords: true })
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)

		typo = 'Can yu readtHIS messa ge despite thehorible 1234 sppelingmsitakes'
		correction = 'can you read this message despite the horrible 1234 spelling mistakes'
		results = symSpell.lookupCompound(typo, maxEditDistance, { ignoreNonWords: true })
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)

		typo = 'Can yu readtHIS messa ge despite thehorible AB1234 sppelingmsitakes'
		correction = 'can you read this message despite the horrible AB1234 spelling mistakes'
		results = symSpell.lookupCompound(typo, maxEditDistance, { ignoreNonWords: true })
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)

		typo = 'PI on leave, arrange Co-I to do screening'
		correction = 'PI on leave arrange co i to do screening'
		results = symSpell.lookupCompound(typo, maxEditDistance, { ignoreNonWords: true })
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)
	})

	it('testLookupCompoundIgnoreNonWordsNoBigram', async () => {
		const maxEditDistance = 2
		const prefixLength = 7
		const symSpell = new SymSpell(maxEditDistance, prefixLength)
		await symSpell.loadDictionary(dictionaryPath, 0, 1)

		let typo = "whereis th elove 123 hehad dated forImuch of THEPAST who couqdn'tread in SIXTHgrade and ins pired him"
		let correction = "whereas the love 123 head dated for much of THEPAST who couldn't read in sixth grade and inspired him"
		let results = symSpell.lookupCompound(typo, maxEditDistance, { ignoreNonWords: true })
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)

		typo = 'in te DHIRD 1 qarter oflast jear he hadlearned ofca sekretplan'
		correction = 'in the DHIRD 1 quarter of last year he had learned of a secret plan'
		results = symSpell.lookupCompound(typo, maxEditDistance, { ignoreNonWords: true })
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)

		typo = 'the bigjest playrs in te stroGSOmmer film slatew ith PLETY of 12 funn'
		correction = 'the biggest players in the strong summer film slate with PLETY of 12 fun'
		results = symSpell.lookupCompound(typo, maxEditDistance, { ignoreNonWords: true })
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)

		typo = 'Can yu readtHIS messa ge despite thehorible 1234 sppelingmsitakes'
		correction = 'can you read this message despite the horrible 1234 spelling mistakes'
		results = symSpell.lookupCompound(typo, maxEditDistance, { ignoreNonWords: true })
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)

		typo = 'Can yu readtHIS messa ge despite thehorible AB1234 sppelingmsitakes'
		correction = 'can you read this message despite the horrible AB1234 spelling mistakes'
		results = symSpell.lookupCompound(typo, maxEditDistance, { ignoreNonWords: true })
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)

		typo = 'PI on leave, arrange Co-I to do screening'
		correction = 'PI on leave arrange co i to do screening'
		results = symSpell.lookupCompound(typo, maxEditDistance, { ignoreNonWords: true })
		expect(results.length).to.equal(1)
		expect(results[0].term).to.equal(correction)
	})

	it('testLoadDictionaryEncoding', async () => {
		const dictPath = './test/data/non_en_dict.txt'

		const maxEditDistance = 2
		const prefixLength = 7
		const symSpell = new SymSpell(maxEditDistance, prefixLength)
		await symSpell.loadDictionary(dictPath, 0, 1)

		const result = symSpell.lookup('АБ', SymSpell.Verbosity.TOP, 2)
		expect(result.length).to.equal(1)
		expect(result[0].term).to.equal('АБИ')
	})

	it('testCreateDictionary', async () => {
		const corpusPath = './test/data/big_modified.txt'
		const bigWordsPath = './test/data/big_words.txt'

		const maxEditDistance = 2
		const prefixLength = 7
		const symSpell = new SymSpell(maxEditDistance, prefixLength)
		await symSpell.createDictionary(corpusPath)

		const lines = readline.createInterface({
			input: fs.createReadStream(bigWordsPath, 'utf8'),
			output: process.stdout,
			terminal: false
		})

		let numLines = 0

		for await (const line of lines) {
			const [key, count] = line.trim().split(' ')
			expect(parseInt(count, 10)).to.equal(symSpell.words.get(key))
			numLines++
		}

		expect(symSpell.words.size).to.equal(numLines)
	})

	it('testLookupTransferCasing', () => {
		let symSpell = new SymSpell()
		symSpell.createDictionaryEntry('steam', 4)
		let result = symSpell.lookup('Stream', SymSpell.Verbosity.TOP, 2, { transferCasing: true })
		expect(result[0].term).to.equal('Steam')

		symSpell = new SymSpell()
		symSpell.createDictionaryEntry('steam', 4)
		result = symSpell.lookup('StreaM', SymSpell.Verbosity.TOP, 2, { transferCasing: true })
		expect(result[0].term).to.equal('SteaM')

		symSpell = new SymSpell()
		symSpell.createDictionaryEntry('steam', 4)
		result = symSpell.lookup('STREAM', SymSpell.Verbosity.TOP, 2, { transferCasing: true })
		expect(result[0].term).to.equal('STEAM')
	})

	it('testLookupCompoundTransferCasing', async () => {
		const maxEditDistance = 2
		const prefixLength = 7
		const symSpell = new SymSpell(maxEditDistance, prefixLength)
		await symSpell.loadDictionary(dictionaryPath, 0, 1)
		await symSpell.loadBigramDictionary(bigramPath, 0, 2)

		const typo = "Whereis th elove hehaD Dated forImuch of thepast who couqdn'tread in sixthgrade AND ins pired him"
		const correction = "Where is the love he haD Dated for much of the past who couldn't read in sixth grade AND inspired him"

		const results = symSpell.lookupCompound(typo, maxEditDistance, { transferCasing: true })
		expect(results[0].term).to.equal(correction)
	})

	it('testLookupCompoundTransferCasingNoBigram', async () => {
		const maxEditDistance = 2
		const prefixLength = 7
		const symSpell = new SymSpell(maxEditDistance, prefixLength)
		await symSpell.loadDictionary(dictionaryPath, 0, 1)

		const typo = "Whereis th elove hehaD Dated forImuch of thepast who couqdn'tread in sixthgrade AND ins pired him"
		const correction = "Whereas the love heaD Dated for much of the past who couldn't read in sixth grade AND inspired him"

		const results = symSpell.lookupCompound(typo, maxEditDistance, { transferCasing: true })
		expect(results[0].term).to.equal(correction)
	})

	it('testLookupCompoundTransferCasingIgnoreNonwords', async () => {
		const maxEditDistance = 2
		const prefixLength = 7
		const symSpell = new SymSpell(maxEditDistance, prefixLength)
		await symSpell.loadDictionary(dictionaryPath, 0, 1)
		await symSpell.loadBigramDictionary(bigramPath, 0, 2)

		const typo = "Whereis th elove hehaD Dated FOREEVER forImuch of thepast who couqdn'tread in sixthgrade AND ins pired him"
		const correction = "Where is the love he haD Dated FOREEVER for much of the past who couldn't read in sixth grade AND inspired him"

		const results = symSpell.lookupCompound(typo, maxEditDistance, { ignoreNonWords: true, transferCasing: true })
		expect(results[0].term).to.equal(correction)
	})

	it('testLookupCompoundTransferCasingIgnoreNonwordsNoBigram', async () => {
		const maxEditDistance = 2
		const prefixLength = 7
		const symSpell = new SymSpell(maxEditDistance, prefixLength)
		await symSpell.loadDictionary(dictionaryPath, 0, 1)

		const typo = "Whereis th elove hehaD Dated FOREEVER forImuch of thepast who couqdn'tread in sixthgrade AND ins pired him"
		const correction = "Whereas the love heaD Dated FOREEVER for much of the past who couldn't read in sixth grade AND inspired him"

		const results = symSpell.lookupCompound(typo, maxEditDistance, { ignoreNonWords: true, transferCasing: true })
		expect(results[0].term).to.equal(correction)
	})

	it('testWordSegmentation', async () => {
		const maxEditDistance = 0
		const prefixLength = 7
		const symSpell = new SymSpell(maxEditDistance, prefixLength)
		await symSpell.loadDictionary(dictionaryPath, 0, 1)

		let typo = 'thequickbrownfoxjumpsoverthelazydog'
		let correction = 'the quick brown fox jumps over the lazy dog'
		let result = symSpell.wordSegmentation(typo)
		expect(result.correctedString).to.equal(correction)

		typo = 'itwasabrightcolddayinaprilandtheclockswerestrikingthirteen'
		correction = 'it was a bright cold day in april and the clocks were striking thirteen'
		result = symSpell.wordSegmentation(typo)
		expect(result.correctedString).to.equal(correction)

		typo = 'itwasthebestoftimesitwastheworstoftimesitwastheageofwisdomitwastheageoffoolishness'
		correction = 'it was the best of times it was the worst of times it was the age of wisdom it was the age of foolishness'
		result = symSpell.wordSegmentation(typo)
		expect(result.correctedString).to.equal(correction)
	})

	it('testWordSegmentationIgnoreToken', async () => {
		const maxEditDistance = 2
		const prefixLength = 7
		const symSpell = new SymSpell(maxEditDistance, prefixLength)
		await symSpell.loadDictionary(dictionaryPath, 0, 1)

		const typo = '24th december'
		const result = symSpell.wordSegmentation(typo, { ignoreToken: /\d{2}\w*\b/ })
		expect(result.correctedString).to.equal(typo)
	})

	it('testWordSegmentationWithArguments', async () => {
		const maxEditDistance = 0
		const prefixLength = 7
		const symSpell = new SymSpell(maxEditDistance, prefixLength)
		await symSpell.loadDictionary(dictionaryPath, 0, 1)

		let typo = 'thequickbrownfoxjumpsoverthelazydog'
		let correction = 'the quick brown fox jumps over the lazy dog'
		let result = symSpell.wordSegmentation(typo, { maxEditDistance, maxSegmentationWordLength: 11 })
		expect(result.correctedString).to.equal(correction)

		typo = 'itwasabrightcolddayinaprilandtheclockswerestrikingthirteen'
		correction = 'it was a bright cold day in april and the clocks were striking thirteen'
		result = symSpell.wordSegmentation(typo, { maxEditDistance, maxSegmentationWordLength: 11 })
		expect(result.correctedString).to.equal(correction)

		typo = ' itwasthebestoftimesitwastheworstoftimesitwastheageofwisdomitwastheageoffoolishness'
		correction = 'it was the best of times it was the worst of times it was the age of wisdom it was the age of foolishness'
		result = symSpell.wordSegmentation(typo, { maxEditDistance, maxSegmentationWordLength: 11 })
		expect(result.correctedString).to.equal(correction)
	})
})
