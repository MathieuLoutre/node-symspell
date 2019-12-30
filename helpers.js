const difflib = require('difflib')
const itertools = require('iter-tools')

const { zip, zipLongest } = itertools

const isAcronym = (word) => {
	// """Checks is the word is all caps (acronym) and/or contain numbers
	// Parameters
	// ----------
	// word : str
	//     The word to check
	// Returns
	// -------
	// bool
	//     True if the word is all caps and/or contain numbers, e.g.,
	//     ABCDE, AB12C. False if the word contains lower case letters,
	//     e.g., abcde, ABCde, abcDE, abCDe, abc12, ab12c
	// """

	return word.match(/\b[A-Z0-9]{2,}\b/)
}

const parseWordsCase = (phrase, preserveCase) => {
	// """Create a non-unique wordlist from sample text. Language
	// independent (e.g. works with Chinese characters)
	// Parameters
	// ----------
	// phrase : str
	//     Sample text that could contain one or more words
	// preserve_case : bool, optional
	//     A flag to determine if we can to preserve the cases or convert
	//     all to lowercase
	// Returns
	// list
	//     A list of words
	// """
	// # \W non-words, use negated set to ignore non-words and "_"
	// # (underscore). Compatible with non-latin characters, does not
	// # split words at apostrophes

	if (!preserveCase) {
		phrase = phrase.toLowerCase()
	}

	return Array.from(phrase.matchAll(/([^\W_]+['’]*[^\W_]*)/g), (m) => m[0])
}

const transferCasingMatching = (textWithCasing, textWithoutCasing) => {
	// """Transferring the casing from one text to another - assuming that
	// they are 'matching' texts, alias they have the same length.
	// Parameters
	// ----------
	// text_w_casing : str
	//     Text with varied casing
	// text_wo_casing : str
	//     Text that is in lowercase only
	// Returns
	// -------
	// str
	//     Text with the content of `text_wo_casing` and the casing of
	//     `text_w_casing`
	// Raises
	// ------
	// ValueError
	//     If the input texts have different lengths
	// """

	return Array.from(zip(textWithCasing, textWithoutCasing)).map(([x, y]) => {
		return x === x.toUpperCase() ? y.toUpperCase() : y.toLowerCase()
	}).join('')
}

const transferCasingSimilar = (textWithCasing, textWithoutCasing) => {
	// Transferring the casing from one text to another - for similar (not matching) text
	// 1. It will use `difflib`'s `SequenceMatcher` to identify the
	//    different type of changes needed to turn `textWithCasing` into
	//    `textWithoutCasing`
	// 2. For each type of change:
	//    - for inserted sections:
	//      - it will transfer the casing from the prior character
	//      - if no character before or the character before is the\
	//        space, then it will transfer the casing from the following\
	//        character
	//    - for deleted sections: no case transfer is required
	//    - for equal sections: just swap out the text with the original,\
	//      the one with the casings, as otherwise the two are the same
	//    - replaced sections: transfer the casing using\
	//      :meth:`transfer_casing_for_matching_text` if the two has the\
	//      same length, otherwise transfer character-by-character and\
	//      carry the last casing over to any additional characters.
	// Parameters
	// ----------
	// textWithCasing : str
	//     Text with varied casing
	// textWithoutCasing : str
	//     Text that is in lowercase only
	// Returns
	// -------
	// textWithoutCasing : str
	//     If `textWithoutCasing` is empty
	// c : str
	//     Text with the content of `textWithoutCasing` but the casing of
	//     `textWithCasing`
	// Raises
	// ------
	// ValueError
	//     If `textWithCasing` is empty
	// """

	const _sm = new difflib.SequenceMatcher(null, textWithCasing.toLowerCase(), textWithoutCasing)

	// we will collect the case_text:
	let c = ''

	// get the operation codes describing the differences between the
	// two strings and handle them based on the per operation code rules
	_sm.getOpcodes().forEach(([tag, i1, i2, j1, j2]) => {
		// Print the operation codes from the SequenceMatcher:
		// print('{:7}   a[{}:{}] --> b[{}:{}] {!r:>8} --> {!r}'
		//   .format(tag, i1, i2, j1, j2,
		//   textWithCasing.slice(j1, j2),
		//   textWithoutCasing[j1:j2]))

		// inserted character(s)
		if (tag === 'insert') {
			// if this is the first character and so there is no
			// character on the left of this or the left of it a space
			// then take the casing from the following character

			if (i1 === 0 || textWithCasing[i1 - 1] === ' ') {
				if (textWithCasing[i1] && textWithCasing[i1].toUpperCase() === textWithCasing[i1]) {
					c += textWithoutCasing.slice(j1, j2).toUpperCase()
				}
				else {
					c += textWithoutCasing.slice(j1, j2).toLowerCase()
				}
			}
			else {
				// otherwise just take the casing from the prior
				// character
				if (textWithCasing[i1 - 1].toUpperCase() === textWithCasing[i1 - 1]) {
					c += textWithoutCasing.slice(j1, j2).toUpperCase()
				}
				else {
					c += textWithoutCasing.slice(j1, j2).toLowerCase()
				}
			}
		}
		else if (tag === 'equal') {
			// for 'equal' we just transfer the text from the
			// textWithCasing, as anyhow they are equal (without the
			// casing)
			c += textWithCasing.slice(i1, i2)
		}
		else if (tag === 'replace') {
			const _withCasing = textWithCasing.slice(i1, i2)
			const _withoutCasing = textWithoutCasing.slice(j1, j2)

			// if they are the same length, the transfer is easy
			if (_withCasing.length === _withoutCasing.length) {
				c += transferCasingMatching(_withCasing, _withoutCasing)
			}
			else {
				// if the replaced has a different length, then we
				// transfer the casing character-by-character and using
				// the last casing to continue if we run out of the
				// sequence
				let _last = 'lower'

				for (const [w, wo] of zipLongest(_withCasing, _withoutCasing)) {
					if (w && wo) {
						if (w === w.toUpperCase()) {
							c += wo.toUpperCase()
							_last = 'upper'
						}
						else {
							c += wo.toLowerCase()
							_last = 'lower'
						}
					}
					else if (!w && wo) {
						// once we ran out of 'w', we will carry over
						// the last casing to any additional 'wo'
						// characters
						c += _last === 'upper' ? wo.toUpperCase() : wo.toLowerCase()
					}
				}
			}
		}
		// else if (tag === 'delete') {
		//     // for deleted characters we don't need to do anything
		//     continue
		// }
	})

	return c
}

/// <summary>Determines the proper return value of an edit distance function when one or
/// both strings are null.</summary>
const nullDistanceResults = (string1, string2, maxDistance) => {
	if (string1 === null) {
		return string2 === null ? 0 : (string2.length <= maxDistance) ? string2.length : -1
	}

	return string1.length <= maxDistance ? string1.length : -1
}

/// <summary>Calculates starting position and lengths of two strings such that common
/// prefix and suffix substrings are excluded.</summary>
/// <remarks>Expects string1.length to be less than or equal to string2.length</remarks>
const prefixSuffixPrep = (string1, string2) => {
	let len2 = string2.length
	let len1 = string1.length // this is also the minimun length of the two strings

	// suffix common to both strings can be ignored
	while (len1 !== 0 && string1[len1 - 1] === string2[len2 - 1]) {
		len1 = len1 - 1; len2 = len2 - 1
	}

	// prefix common to both strings can be ignored
	let start = 0

	while (start !== len1 && string1[start] === string2[start]) {
		start++
	}

	if (start !== 0) {
		len2 -= start // length of the part excluding common prefix and suffix
		len1 -= start
	}

	return { len1, len2, start }
}

module.exports = {
	isAcronym,
	parseWordsCase,
	transferCasingMatching,
	transferCasingSimilar,
	nullDistanceResults,
	prefixSuffixPrep
}
