const fs = require('fs')
const readline = require('readline')
const EditDistance = require('./edit-distance')
const Helpers = require('./helpers')

// Spelling suggestion returned from Lookup.
class SuggestItem {
	// Create a new instance of SuggestItem.
	// term: The suggested word.
	// distance: Edit distance from search word.
	// count: Frequency of suggestion in dictionary.
	constructor (term = '', distance = 0, count = 0) {
		// The suggested correctly spelled word.
		this.term = term
		// Edit distance between searched for word and suggestion.
		this.distance = distance
		// Frequency of suggestion in the dictionary (a measure of how common the word is).
		this.count = count
	}

	compareTo (other) {
		// order by distance ascending, then by frequency count descending
		if (this.distance === other.distance) {
			return this.count - other.count
		}

		return other.distance - this.distance
	}
}

class SymSpell {
	// number of all words in the corpus used to generate the frequency dictionary
	// this is used to calculate the word occurrence probability p from word counts c : p=c/N
	// N equals the sum of all counts c in the dictionary only if the dictionary is complete, but not if the dictionary is truncated or filtered
	static get N () {
		return 1024908267229
	}

	static get Verbosity () {
		// verbosity=Top: the suggestion with the highest term frequency of the suggestions of smallest edit distance found
		// verbosity=Closest: all suggestions of smallest edit distance found, the suggestions are ordered by term frequency
		// verbosity=All: all suggestions <= maxEditDistance, the suggestions are ordered by edit distance, then by term frequency (slower, no early termination)
		return {
			TOP: 0,
			CLOSEST: 1,
			ALL: 2
		}
	}

	constructor (
		maxDictionaryEditDistance = 2,
		prefixLength = 7,
		countThreshold = 1
	) {
		this.maxDictionaryEditDistance = maxDictionaryEditDistance
		this.prefixLength = prefixLength
		this.countThreshold = countThreshold

		this.words = new Map()
		this.maxDictionaryWordLength = 0
		this.deletes = new Map()
		this.belowThresholdWords = new Map()

		this.bigrams = new Map()
		this.bigramCountMin = Number.MAX_SAFE_INTEGER
	}

	// Create/Update an entry in the dictionary.
	// For every word there are deletes with an edit distance of 1..maxEditDistance created and added to the
	// dictionary. Every delete entry has a suggestions list, which points to the original term(s) it was created from.
	// The dictionary may be dynamically updated (word frequency and new words) at any time by calling createDictionaryEntry
	// key: The word to add to dictionary.
	// count: The frequency count for word.
	// staging: Optional staging object to speed up adding many entries by staging them to a temporary structure.
	// returns -> True if the word was added as a new correctly spelled word, or false if the word is added as a below threshold word, or updates an existing correctly spelled word.
	createDictionaryEntry (key, count) {
		if (count <= 0) {
			if (this.countThreshold > 0) return false // no point doing anything if count is zero, as it can't change anything
			count = 0
		}

		let countPrevious = -1

		// look first in below threshold words, update count, and allow promotion to correct spelling word if count reaches threshold
		// threshold must be >1 for there to be the possibility of low threshold words
		if (this.countThreshold > 1 && this.belowThresholdWords.has(key)) {
			countPrevious = this.belowThresholdWords.get(key)

			// calculate new count for below threshold word
			count = (Number.MAX_SAFE_INTEGER - countPrevious > count) ? countPrevious + count : Number.MAX_SAFE_INTEGER

			// has reached threshold - remove from below threshold collection (it will be added to correct words below)
			if (count >= this.countThreshold) {
				this.belowThresholdWords.delete(key)
			}
			else {
				this.belowThresholdWords.set(key, count)

				return false
			}
		}
		else if (this.words.has(key)) {
			countPrevious = this.words.get(key)

			// just update count if it's an already added above threshold word
			count = (Number.MAX_SAFE_INTEGER - countPrevious > count) ? countPrevious + count : Number.MAX_SAFE_INTEGER
			this.words.set(key, count)

			return false
		}
		else if (count < this.countThreshold) {
			// new or existing below threshold word
			this.belowThresholdWords.set(key, count)

			return false
		}

		// what we have at this point is a new, above threshold word
		this.words.set(key, count)

		// edits/suggestions are created only once, no matter how often word occurs
		// edits/suggestions are created only as soon as the word occurs in the corpus,
		// even if the same term existed before in the dictionary as an edit from another word
		if (key.length > this.maxDictionaryWordLength) {
			this.maxDictionaryWordLength = key.length
		}

		// create deletes
		const edits = this.editsPrefix(key)

		// put suggestions directly into main data structure
		edits.forEach((val, del) => {
			if (!this.deletes.has(del)) {
				this.deletes.set(del, [])
			}

			this.deletes.get(del).push(key)
		})

		return true
	}

	// Load multiple dictionary entries from a file of word/frequency count pairs
	// Merges with any dictionary data already loaded.
	// corpus: The path+filename of the file.
	// termIndex: The column position of the word.
	// countIndex: The column position of the frequency count.
	// separator: Separator characters between term(s) and count.
	// returns ->True if file loaded, or false if file not found.
	async loadBigramDictionary (dictFile, termIndex, countIndex, separator = ' ') {
		const lines = readline.createInterface({
			input: fs.createReadStream(dictFile, 'utf8'),
			output: process.stdout,
			terminal: false
		})

		for await (const line of lines) {
			const linePartsLength = (separator === ' ') ? 3 : 2
			const lineParts = line.trim().split(separator)

			if (lineParts.length >= linePartsLength) {
				// if default (whitespace) is defined as separator take 2 term parts, otherwise take only one
				const key = (separator === ' ') ? lineParts[termIndex] + ' ' + lineParts[termIndex + 1] : lineParts[termIndex]
				// Int64 count;
				const count = parseInt(lineParts[countIndex], 10)
				this.bigrams.set(key, count)

				if (count < this.bigramCountMin) {
					this.bigramCountMin = count
				}
			}
		}

		return true
	}

	// Load multiple dictionary entries from a file of word/frequency count pairs
	// Merges with any dictionary data already loaded.
	// corpus: The path+filename of the file.
	// termIndex: The column position of the word.
	// countIndex: The column position of the frequency count.
	// separator: Separator characters between term(s) and count.
	// returns ->True if file loaded, or false if file not found.
	async loadDictionary (dictFile, termIndex, countIndex, separator = ' ') {
		const lines = readline.createInterface({
			input: fs.createReadStream(dictFile, 'utf8'),
			output: process.stdout,
			terminal: false
		})

		for await (const line of lines) {
			const lineParts = line.trim().split(separator)

			if (lineParts.length >= 2) {
				const key = lineParts[termIndex]
				const count = parseInt(lineParts[countIndex], 10)
				this.createDictionaryEntry(key, count)
			}
		}

		return true
	}

	// Load multiple dictionary words from a file containing plain text.
	// Merges with any dictionary data already loaded.
	// corpus: The path+filename of the file.
	// returns ->True if file loaded, or false if file not found.
	async createDictionary (dictFile) {
		const lines = readline.createInterface({
			input: fs.createReadStream(dictFile, 'utf8'),
			output: process.stdout,
			terminal: false
		})

		for await (const line of lines) {
			this.parseWords(line).forEach((key) => {
				this.createDictionaryEntry(key, 1)
			})
		}

		return true
	}

	// Find suggested spellings for a given input word.
	// input: The word being spell checked.
	// verbosity: The value controlling the quantity/closeness of the retuned suggestions.
	// maxEditDistance: The maximum edit distance between input and suggested words.
	// includeUnknown: Include input word in suggestions, if no words within edit distance found.
	// returns ->A List of SuggestItem object representing suggested correct spellings for the input word,
	// sorted by edit distance, and secondarily by count frequency.
	lookup (input, verbosity, maxEditDistance = null, { includeUnknown, ignoreToken, transferCasing } = {}) {
		// maxEditDistance used in Lookup can't be bigger than the maxDictionaryEditDistance
		// used to construct the underlying dictionary structure.
		if (maxEditDistance === null) {
			maxEditDistance = this.maxDictionaryEditDistance
		}

		let suggestions = []
		const inputLen = input.length
		let originalPhrase = ''

		if (transferCasing) {
			originalPhrase = input
			input = input.toLowerCase()
		}

		const earlyExit = () => {
			if (includeUnknown && suggestions.length === 0) {
				suggestions.push(new SuggestItem(input, maxEditDistance + 1, 0))
			}

			return suggestions
		}

		// early exit - word is too big to possibly match any words
		if (inputLen - maxEditDistance > this.maxDictionaryWordLength) {
			return earlyExit()
		}

		// quick look for exact match
		let suggestionCount = 0

		if (this.words.has(input)) {
			suggestionCount = this.words.get(input)
			suggestions.push(new SuggestItem(input, 0, suggestionCount))

			// early exit - return exact match, unless caller wants all matches
			if (verbosity !== SymSpell.Verbosity.ALL) {
				return earlyExit()
			}
		}

		if (ignoreToken && input.match(ignoreToken)) {
			suggestionCount = 1
			suggestions.push(new SuggestItem(input, 0, suggestionCount))

			// early exit - return exact match, unless caller wants all matches
			if (verbosity !== SymSpell.Verbosity.ALL) {
				return earlyExit()
			}
		}

		// early termination, if we only want to check if word in dictionary or get its frequency e.g. for word segmentation
		if (maxEditDistance === 0) {
			return earlyExit()
		}

		const consideredDeletes = new Set()
		const consideredSuggestions = new Set()

		// we considered the input already in the words.has(input) above
		consideredSuggestions.add(input)

		let maxEditDistance2 = maxEditDistance
		let candidatePointer = 0
		const candidates = []

		// add original prefix
		let inputPrefixLen = inputLen

		if (inputPrefixLen > this.prefixLength) {
			inputPrefixLen = this.prefixLength
			candidates.push(input.substr(0, inputPrefixLen))
		}
		else {
			candidates.push(input)
		}

		const distanceComparer = new EditDistance()

		while (candidatePointer < candidates.length) {
			const candidate = candidates[candidatePointer]
			candidatePointer += 1
			const candidateLen = candidate.length
			const lengthDiff = inputPrefixLen - candidateLen

			// save some time - early termination
			// if canddate distance is already higher than suggestion distance, than there are no better suggestions to be expected
			if (lengthDiff > maxEditDistance2) {
				// skip to next candidate if Verbosity.ALL, look no further if Verbosity.TOP or Closest
				// (candidates are ordered by delete distance, so none are closer than current)
				if (verbosity === SymSpell.Verbosity.ALL) {
					continue
				}

				break
			}

			// read candidate entry from dictionary
			if (this.deletes.has(candidate)) {
				const dictSuggestions = this.deletes.get(candidate)

				for (let i = 0; i < dictSuggestions.length; i++) {
					const suggestion = dictSuggestions[i]

					if (suggestion === input) {
						continue
					}

					const suggestionLen = suggestion.length

					if (
						Math.abs(suggestionLen - inputLen) > maxEditDistance2 || // input and sugg lengths diff > allowed/current best distance
						suggestionLen < candidateLen || // sugg must be for a different delete string, in same bin only because of hash collision
						(suggestionLen === candidateLen && suggestion !== candidate) // if sugg len = delete len, then it either equals delete or is in same bin only because of hash collision
					) {
						continue
					}

					const suggPrefixLen = Math.min(suggestionLen, this.prefixLength)

					if (suggPrefixLen > inputPrefixLen && (suggPrefixLen - candidateLen) > maxEditDistance2) {
						continue
					}

					// True Damerau-Levenshtein Edit Distance: adjust distance, if both distances>0
					// We allow simultaneous edits (deletes) of maxEditDistance on on both the dictionary and the input term.
					// For replaces and adjacent transposes the resulting edit distance stays <= maxEditDistance.
					// For inserts and deletes the resulting edit distance might exceed maxEditDistance.
					// To prevent suggestions of a higher edit distance, we need to calculate the resulting edit distance, if there are simultaneous edits on both sides.
					// Example: (bank==bnak and bank==bink, but bank!=kanb and bank!=xban and bank!=baxn for maxEditDistance=1)
					// Two deletes on each side of a pair makes them all equal, but the first two pairs have edit distance=1, the others edit distance=2.
					let distance = 0
					let min = 0

					if (candidateLen === 0) {
						// suggestions which have no common chars with input (inputLen<=maxEditDistance && suggestionLen<=maxEditDistance)
						distance = Math.max(inputLen, suggestionLen)

						if (distance > maxEditDistance2 || consideredSuggestions.has(suggestion)) {
							continue
						}
					}
					else if (suggestionLen === 1) {
						distance = (input.indexOf(suggestion[0]) < 0) ? inputLen : inputLen - 1

						if (distance > maxEditDistance2 || consideredSuggestions.has(suggestion)) {
							continue
						}
					}
					// number of edits in prefix ==maxediddistance  AND no identic suffix , then editdistance>maxEditDistance and no need for Levenshtein calculation (inputLen >= this.prefixLength) && (suggestionLen >= this.prefixLength)
					else {
						if (this.prefixLength - maxEditDistance === candidateLen) {
							min = Math.min(inputLen, suggestionLen) - this.prefixLength
						}

						if (
							this.prefixLength - maxEditDistance === candidateLen &&
							((
								min > 1 &&
								input.substr(inputLen + 1 - min) !== suggestion.substr(suggestionLen + 1 - min)
							) ||
							(
								min > 0 &&
								input[inputLen - min] !== suggestion[suggestionLen - min] &&
								(
									input[inputLen - min - 1] !== suggestion[suggestionLen - min] ||
									input[inputLen - min] !== suggestion[suggestionLen - min - 1]
								)
							))
						) {
							continue
						}
						else {
							// deleteInSuggestionPrefix is somewhat expensive, and only pays off when verbosity is Top or Closest.
							if (
								(
									verbosity !== SymSpell.Verbosity.ALL &&
									!this.deleteInSuggestionPrefix(candidate, candidateLen, suggestion, suggestionLen)
								) || consideredSuggestions.has(suggestion)
							) {
								continue
							}

							consideredSuggestions.add(suggestion)

							distance = distanceComparer.compare(input, suggestion, maxEditDistance2)

							if (distance < 0) {
								continue
							}
						}
					}

					// save some time
					// do not process higher distances than those already found, if verbosity<All (note: maxEditDistance2 will always equal maxEditDistance when Verbosity.ALL)
					if (distance <= maxEditDistance2) {
						const suggestionCount = this.words.get(suggestion)
						const si = new SuggestItem(suggestion, distance, suggestionCount)

						if (suggestions.length > 0) {
							switch (verbosity) {
							case SymSpell.Verbosity.CLOSEST: {
								// we will calculate DamLev distance only to the smallest found distance so far
								if (distance < maxEditDistance2) {
									suggestions = []
								}

								break
							}

							case SymSpell.Verbosity.TOP: {
								if (distance < maxEditDistance2 || suggestionCount > suggestions[0].count) {
									maxEditDistance2 = distance
									suggestions[0] = si
								}

								continue
							}
							}
						}

						if (verbosity !== SymSpell.Verbosity.ALL) {
							maxEditDistance2 = distance
						}

						suggestions.push(si)
					}
				} // end foreach
			} // end if

			// add edits
			// derive edits (deletes) from candidate (input) and add them to candidates list
			// this is a recursive process until the maximum edit distance has been reached
			if (lengthDiff < maxEditDistance && candidateLen <= this.prefixLength) {
				// save some time
				// do not create edits with edit distance smaller than suggestions already found
				if (verbosity !== SymSpell.Verbosity.ALL && lengthDiff >= maxEditDistance2) {
					continue
				}

				for (let i = 0; i < candidateLen; i++) {
					const del = candidate.slice(0, i) + candidate.slice(i + 1, candidate.length)

					if (!consideredDeletes.has(del)) {
						consideredDeletes.add(del)
						candidates.push(del)
					}
				}
			}
		} // end while

		// sort by ascending edit distance, then by descending word frequency
		if (suggestions.length > 1) {
			suggestions.sort((a, b) => a.compareTo(b)).reverse()
		}

		if (transferCasing) {
			suggestions = suggestions.map((s) => {
				return new SuggestItem(Helpers.transferCasingSimilar(originalPhrase, s.term), s.distance, s.count)
			})
		}

		return earlyExit()
	}

	// check whether all delete chars are present in the suggestion prefix in correct order, otherwise this is just a hash collision
	deleteInSuggestionPrefix (del, deleteLen, suggestion, suggestionLen) {
		if (deleteLen === 0) {
			return true
		}

		if (this.prefixLength < suggestionLen) {
			suggestionLen = this.prefixLength
		}

		let j = 0

		for (let i = 0; i < deleteLen; i++) {
			const delChar = del[i]

			while (j < suggestionLen && delChar !== suggestion[j]) {
				j++
			}

			if (j === suggestionLen) {
				return false
			}
		}

		return true
	}

	// create a non-unique wordlist from sample text
	// language independent (e.g. works with Chinese characters)
	parseWords (text) {
		// \w Alphanumeric characters (including non-latin characters, umlaut characters and digits) plus "_"
		// \d Digits
		// Compatible with non-latin characters, does not split words at apostrophes
		const matches = text.toLowerCase().matchAll(/(([^\W_]|['’])+)/g)

		return Array.from(matches, (match) => match[0])
	}

	// inexpensive and language independent: only deletes, no transposes + replaces + inserts
	// replaces and inserts are expensive and language dependent (Chinese has 70,000 Unicode Han characters)
	edits (word, editDistance, deleteWords) {
		editDistance++

		if (word.length > 1) {
			for (let i = 0; i < word.length; i++) {
				const del = word.slice(0, i) + word.slice(i + 1, word.length)

				if (!deleteWords.has(del)) {
					deleteWords.add(del)

					// recursion, if maximum edit distance not yet reached
					if (editDistance < this.maxDictionaryEditDistance) {
						this.edits(del, editDistance, deleteWords)
					}
				}
			}
		}

		return deleteWords
	}

	editsPrefix (key) {
		const hashSet = new Set()

		if (key.length <= this.maxDictionaryEditDistance) {
			hashSet.add('')
		}

		if (key.length > this.prefixLength) {
			key = key.substr(0, this.prefixLength)
		}

		hashSet.add(key)

		return this.edits(key, 0, hashSet)
	}

	// ######################

	// LookupCompound supports compound aware automatic spelling correction of multi-word input strings with three cases:
	// 1. mistakenly inserted space into a correct word led to two incorrect terms
	// 2. mistakenly omitted space between two correct words led to one incorrect combined term
	// 3. multiple independent input terms with/without spelling errors

	// Find suggested spellings for a multi-word input string (supports word splitting/merging).
	// input: The string being spell checked.
	// maxEditDistance: The maximum edit distance between input and suggested words.
	// returns ->A List of SuggestItem object representing suggested correct spellings for the input string.
	lookupCompound (input, maxEditDistance = null, { ignoreNonWords, transferCasing } = {}) {
		if (maxEditDistance === null) {
			maxEditDistance = this.maxDictionaryEditDistance
		}

		// parse input string into single terms
		const termList1 = Helpers.parseWordsCase(input)
		let termList2 = []

		if (ignoreNonWords) {
			termList2 = Helpers.parseWordsCase(input, true)
		}

		let suggestions = [] // suggestions for a single term
		const suggestionParts = [] // 1 line with separate parts
		const distanceComparer = new EditDistance()

		// translate every term to its best suggestion, otherwise it remains unchanged
		let lastCombi = false

		for (let i = 0; i < termList1.length; i++) {
			if (ignoreNonWords) {
				if (parseInt(termList1[i], 10)) {
					suggestionParts.push(new SuggestItem(termList1[i], 0, 0))
					continue
				}

				if (Helpers.isAcronym(termList2[i])) {
					suggestionParts.push(new SuggestItem(termList2[i], 0, 0))
					continue
				}
			}

			suggestions = this.lookup(termList1[i], SymSpell.Verbosity.TOP, maxEditDistance)

			// combi check, always before split
			if (i > 0 && !lastCombi) {
				const suggestionsCombi = this.lookup(termList1[i - 1] + termList1[i], SymSpell.Verbosity.TOP, maxEditDistance)

				if (suggestionsCombi.length > 0) {
					const best1 = suggestionParts[suggestionParts.length - 1]
					let best2 = new SuggestItem()

					if (suggestions.length > 0) {
						best2 = suggestions[0]
					}
					else {
						// unknown word
						best2.term = termList1[i]
						// estimated edit distance
						best2.distance = maxEditDistance + 1
						// estimated word occurrence probability P=10 / (N * 10^word length l)
						best2.count = 10 / Math.pow(10, best2.term.length) // 0;
					}

					// distance1=edit distance between 2 split terms und their best corrections : als comparative value for the combination
					const distance1 = best1.distance + best2.distance

					if (
						distance1 >= 0 &&
						(
							suggestionsCombi[0].distance + 1 < distance1 ||
							(
								suggestionsCombi[0].distance + 1 === distance1 &&
								suggestionsCombi[0].count > best1.count / SymSpell.N * best2.count
							)
						)
					) {
						suggestionsCombi[0].distance++
						suggestionParts[suggestionParts.length - 1] = suggestionsCombi[0]
						lastCombi = true

						continue
					}
				}
			}

			lastCombi = false

			// alway split terms without suggestion / never split terms with suggestion ed=0 / never split single char terms
			if (suggestions.length > 0 && (suggestions[0].distance === 0 || termList1[i].length === 1)) {
				// choose best suggestion
				suggestionParts.push(suggestions[0])
			}
			else {
				// if no perfect suggestion, split word into pairs
				let suggestionSplitBest = null

				// add original term
				if (suggestions.length > 0) {
					suggestionSplitBest = suggestions[0]
				}

				if (termList1[i].length > 1) {
					for (let j = 1; j < termList1[i].length; j++) {
						const part1 = termList1[i].substr(0, j)
						const part2 = termList1[i].substr(j)
						const suggestionSplit = new SuggestItem()
						const suggestions1 = this.lookup(part1, SymSpell.Verbosity.TOP, maxEditDistance)

						if (suggestions1.length > 0) {
							const suggestions2 = this.lookup(part2, SymSpell.Verbosity.TOP, maxEditDistance)

							if (suggestions2.length > 0) {
								// select best suggestion for split pair
								suggestionSplit.term = suggestions1[0].term + ' ' + suggestions2[0].term

								let distance2 = distanceComparer.compare(termList1[i], suggestionSplit.term, maxEditDistance)

								if (distance2 < 0) {
									distance2 = maxEditDistance + 1
								}

								if (suggestionSplitBest !== null) {
									if (distance2 > suggestionSplitBest.distance) {
										continue
									}

									if (distance2 < suggestionSplitBest.distance) {
										suggestionSplitBest = null
									}
								}

								suggestionSplit.distance = distance2

								// if bigram exists in bigram dictionary
								if (this.bigrams.has(suggestionSplit.term)) {
									const bigramCount = this.bigrams.get(suggestionSplit.term)
									suggestionSplit.count = bigramCount

									// increase count, if split.corrections are part of or identical to input
									// single term correction exists
									if (suggestions.length > 0) {
										// alternatively remove the single term from suggestionsSplit, but then other splittings could win
										if ((suggestions1[0].term + suggestions2[0].term === termList1[i])) {
											// make count bigger than count of single term correction
											suggestionSplit.count = Math.max(suggestionSplit.count, suggestions[0].count + 2)
										}
										else if (suggestions1[0].term === suggestions[0].term || suggestions2[0].term === suggestions[0].term) {
											// make count bigger than count of single term correction
											suggestionSplit.count = Math.max(suggestionSplit.count, suggestions[0].count + 1)
										}
									}
									// no single term correction exists
									else if (suggestions1[0].term + suggestions2[0].term === termList1[i]) {
										suggestionSplit.count = Math.max(suggestionSplit.count, Math.max(suggestions1[0].count, suggestions2[0].count) + 2)
									}
								}
								else {
									// The Naive Bayes probability of the word combination is the product of the two word probabilities: P(AB) = P(A) * P(B)
									// use it to estimate the frequency count of the combination, which then is used to rank/select the best splitting variant
									suggestionSplit.count = Math.floor(Math.min(this.bigramCountMin, suggestions1[0].count / SymSpell.N * suggestions2[0].count))
								}

								if (suggestionSplitBest === null || suggestionSplit.count > suggestionSplitBest.count) {
									suggestionSplitBest = suggestionSplit
								}
							}
						}
					}

					if (suggestionSplitBest !== null) {
						// select best suggestion for split pair
						suggestionParts.push(suggestionSplitBest)
					}
					else {
						const si = new SuggestItem()
						si.term = termList1[i]
						// estimated word occurrence probability P=10 / (N * 10^word length l)
						si.count = Math.floor(10 / Math.pow(10, si.term.length))
						si.distance = maxEditDistance + 1
						suggestionParts.push(si)
					}
				}
				else {
					const si = new SuggestItem()
					si.term = termList1[i]
					// estimated word occurrence probability P=10 / (N * 10^word length l)
					si.count = Math.floor(10 / Math.pow(10, si.term.length))
					si.distance = maxEditDistance + 1
					suggestionParts.push(si)
				}
			}
		}

		const suggestion = new SuggestItem()

		let count = SymSpell.N
		let s = ''

		suggestionParts.forEach((si) => {
			s += si.term + ' '
			count *= si.count / SymSpell.N
		})

		suggestion.count = Math.floor(count)
		suggestion.term = s.trimEnd()

		if (transferCasing) {
			suggestion.term = Helpers.transferCasingSimilar(input, suggestion.term)
		}

		suggestion.distance = distanceComparer.compare(input, suggestion.term, Number.MAX_SAFE_INTEGER)

		const suggestionsLine = []
		suggestionsLine.push(suggestion)

		return suggestionsLine
	}

	// ######

	// WordSegmentation divides a string into words by inserting missing spaces at the appropriate positions
	// misspelled words are corrected and do not affect segmentation
	// existing spaces are allowed and considered for optimum segmentation

	// SymSpell.WordSegmentation uses a novel approach *without* recursion.
	// https://medium.com/@wolfgarbe/fast-word-segmentation-for-noisy-text-2c2c41f9e8da
	// While each string of length n can be segmentend in 2^n−1 possible compositions https://en.wikipedia.org/wiki/Composition_(combinatorics)
	// SymSpell.WordSegmentation has a linear runtime O(n) to find the optimum composition

	/// Find suggested spellings for a multi-word input string (supports word splitting/merging).
	/// input: The string being spell checked.
	/// maxSegmentationWordLength: The maximum word length that should be considered.
	/// maxEditDistance: The maximum edit distance between input and corrected words
	/// (0=no correction/segmentation only).
	/// The word segmented string as segmentedString,
	/// the word segmented and spelling corrected string as correctedString,
	/// the Edit distance sum between input string and corrected string as distanceSum,
	/// the Sum of word occurence probabilities in log scale (a measure of how common and probable the corrected segmentation is) as probabilityLogSum.
	wordSegmentation (input, { maxEditDistance = null, maxSegmentationWordLength = null, ignoreToken } = {}) {
		if (maxEditDistance === null) {
			maxEditDistance = this.maxDictionaryEditDistance
		}

		if (maxSegmentationWordLength === null) {
			maxSegmentationWordLength = this.maxDictionaryWordLength
		}

		const arraySize = Math.min(maxSegmentationWordLength, input.length)
		const compositions = new Array(arraySize)
		let circularIndex = -1

		// outer loop (column): all possible part start positions
		for (let j = 0; j < input.length; j++) {
			// inner loop (row): all possible part lengths (from start position): part can't be bigger than longest word in dictionary (other than long unknown word)
			const imax = Math.min(input.length - j, maxSegmentationWordLength)

			for (let i = 1; i <= imax; i++) {
				// get top spelling correction/ed for part
				let part = input.substr(j, i)
				let separatorLength = 0
				let topEd = 0
				let topProbabilityLog = 0
				let topResult = ''

				// if it's whitespace
				if (part[0].match(/\s/)) {
					// remove space for levensthein calculation
					part = part.substr(1)
				}
				else {
					// add ed+1: space did not exist, had to be inserted
					separatorLength = 1
				}

				// remove space from part1, add number of removed spaces to topEd
				topEd += part.length
				// remove space
				part = part.replace(/\s+/g, '') //= System.Text.RegularExpressions.Regex.Replace(part1, @"\s+", "");
				// add number of removed spaces to ed
				topEd -= part.length

				const results = this.lookup(part, SymSpell.Verbosity.TOP, maxEditDistance, { ignoreToken })

				if (results.length > 0) {
					topResult = results[0].term
					topEd += results[0].distance
					// Naive Bayes Rule
					// we assume the word probabilities of two words to be independent
					// therefore the resulting probability of the word combination is the product of the two word probabilities

					// instead of computing the product of probabilities we are computing the sum of the logarithm of probabilities
					// because the probabilities of words are about 10^-10, the product of many such small numbers could exceed (underflow) the floating number range and become zero
					// log(ab)=log(a)+log(b)
					topProbabilityLog = Math.log10(results[0].count / SymSpell.N)
				}
				else {
					topResult = part
					// default, if word not found
					// otherwise long input text would win as long unknown word (with ed=edmax+1 ), although there there should many spaces inserted
					topEd += part.length
					topProbabilityLog = Math.log10(10.0 / (SymSpell.N / Math.pow(10.0, part.length)))
				}

				const destinationIndex = (i + circularIndex) % arraySize

				// set values in first loop
				if (j === 0) {
					compositions[destinationIndex] = { 
						segmentedString: part,
						correctedString: topResult,
						distanceSum: topEd,
						probabilityLogSum: topProbabilityLog
					}
				}
				else if ((i === maxSegmentationWordLength) ||
                    // replace values if better probabilityLogSum, if same edit distance OR one space difference
                    (((compositions[circularIndex].distanceSum + topEd === compositions[destinationIndex].distanceSum) || (compositions[circularIndex].distanceSum + separatorLength + topEd === compositions[destinationIndex].distanceSum)) && (compositions[destinationIndex].probabilityLogSum < compositions[circularIndex].probabilityLogSum + topProbabilityLog)) ||
                    // replace values if smaller edit distance
                    (compositions[circularIndex].distanceSum + separatorLength + topEd < compositions[destinationIndex].distanceSum)) {
					compositions[destinationIndex] = {
						segmentedString: (compositions[circularIndex].segmentedString || '') + ' ' + part,
						correctedString: (compositions[circularIndex].correctedString || '') + ' ' + topResult,
						distanceSum: (compositions[circularIndex].distanceSum || 0) + separatorLength + topEd,
						probabilityLogSum: (compositions[circularIndex].probabilityLogSum || 0) + topProbabilityLog
					}
				}
			}

			circularIndex += 1

			if (circularIndex === arraySize) {
				circularIndex = 0
			}
		}

		return compositions[circularIndex]
	}
}

module.exports = SymSpell
