const Helpers = require('./helpers')

/// <summary>
/// Class providing optimized methods for computing Damerau-Levenshtein Optimal String
/// Alignment (OSA) comparisons between two strings.
/// </summary>
/// <remarks>
/// Copyright ©2015-2018 SoftWx, Inc.
/// The inspiration for creating highly optimized edit distance functions was
/// from Sten Hjelmqvist's "Fast, memory efficient" algorithm, described at
/// http://www.codeproject.com/Articles/13525/Fast-memory-efficient-Levenshtein-algorithm
/// The Damerau-Levenshtein algorithm is basically the Levenshtein algorithm with a
/// modification that considers transposition of two adjacent characters as a single edit.
/// The optimized algorithm was described in detail in my post at
/// http://blog.softwx.net/2015/01/optimizing-damerau-levenshtein_15.html
/// Also see http://en.wikipedia.org/wiki/Damerau%E2%80%93Levenshtein_distance
/// Note that this implementation of Damerau-Levenshtein is the simpler and faster optimal
/// string alignment (aka restricted edit) distance that difers slightly from the classic
/// algorithm by imposing the restriction that no substring is edited more than once. So,
/// for example, "CA" to "ABC" has an edit distance of 2 by a complete application of
/// Damerau-Levenshtein, but has a distance of 3 by the method implemented here, that uses
/// the optimal string alignment algorithm. This means that this algorithm is not a true
/// metric since it does not uphold the triangle inequality. In real use though, this OSA
/// version may be desired. Besides being faster, it does not give the lower distance score
/// for transpositions that occur across long distances. Actual human error transpositions
/// are most likely for adjacent characters. For example, the classic Damerau algorithm
/// gives a distance of 1 for these two strings: "sated" and "dates" (it counts the 's' and
/// 'd' as a single transposition. The optimal string alignment version of Damerau in this
/// class gives a distance of 2 for these two strings (2 substitutions), as it only counts
/// transpositions for adjacent characters.
/// The methods in this class are not threadsafe. Use the static versions in the Distance
/// class if that is required.</remarks>
class EditDistance {
	constructor () {
		this.baseChar1Costs = []
		this.basePrevChar1Costs = []
	}

	compare (string1, string2, maxDistance) {
		return this.distance(string1, string2, maxDistance)
	}

	/// <summary>Compute and return the Damerau-Levenshtein optimal string
	/// alignment edit distance between two strings.</summary>
	/// <remarks>https://github.com/softwx/SoftWx.Match
	/// This method is not threadsafe.</remarks>
	/// <param name="string1">One of the strings to compare.</param>
	/// <param name="string2">The other string to compare.</param>
	/// <param name="maxDistance">The maximum distance that is of interest.</param>
	/// <returns>-1 if the distance is greater than the maxDistance, 0 if the strings
	/// are equivalent, otherwise a positive number whose magnitude increases as
	/// difference between the strings increases.</returns>
	distance (string1 = null, string2 = null, maxDistance) {
		if (string1 === null || string2 === null) {
			return Helpers.nullDistanceResults(string1, string2, maxDistance)
		}

		if (maxDistance <= 0) {
			return (string1 === string2) ? 0 : -1
		}

		maxDistance = Math.ceil(maxDistance)
		const iMaxDistance = (maxDistance <= Number.MAX_SAFE_INTEGER) ? maxDistance : Number.MAX_SAFE_INTEGER

		// if strings of different lengths, ensure shorter string is in string1. This can result in a little faster speed by spending more time spinning just the inner loop during the main processing.
		if (string1.length > string2.length) {
			const t = string1
			string1 = string2
			string2 = t
		}

		if (string2.length - string1.length > iMaxDistance) {
			return -1
		}

		// identify common suffix and/or prefix that can be ignored
		const { len1, len2, start } = Helpers.prefixSuffixPrep(string1, string2)

		if (len1 === 0) {
			return (len2 <= iMaxDistance) ? len2 : -1
		}

		if (len2 > this.baseChar1Costs.length) {
			this.baseChar1Costs = new Array(len2)
			this.basePrevChar1Costs = new Array(len2)
		}

		if (iMaxDistance < len2) {
			return this._distanceMax(string1, string2, len1, len2, start, iMaxDistance, this.baseChar1Costs, this.basePrevChar1Costs)
		}

		return this._distance(string1, string2, len1, len2, start, this.baseChar1Costs, this.basePrevChar1Costs)
	}

	/// <summary>Internal implementation of the core Damerau-Levenshtein, optimal string alignment algorithm.</summary>
	/// <remarks>https://github.com/softwx/SoftWx.Match</remarks>
	_distance (string1, string2, len1, len2, start, char1Costs, prevChar1Costs) {
		char1Costs = []

		for (let j = 0; j < len2;) {
			char1Costs[j] = ++j
		}

		let char1 = ' '
		let currentCost = 0

		for (let i = 0; i < len1; ++i) {
			const prevChar1 = char1
			char1 = string1[start + i]
			let char2 = ' '
			let aboveCharCost = i
			let leftCharCost = i
			let nextTransCost = 0

			for (let j = 0; j < len2; ++j) {
				const thisTransCost = nextTransCost
				nextTransCost = prevChar1Costs[j]
				currentCost = leftCharCost
				prevChar1Costs[j] = leftCharCost // cost of diagonal (substitution)
				leftCharCost = char1Costs[j] // left now equals current cost (which will be diagonal at next iteration)
				const prevChar2 = char2
				char2 = string2[start + j]

				if (char1 !== char2) {
					// substitution if neither of two conditions below
					if (aboveCharCost < currentCost) {
						currentCost = aboveCharCost // deletion
					}

					if (leftCharCost < currentCost) {
						currentCost = leftCharCost // insertion
					}

					++currentCost

					if ((i !== 0) && (j !== 0) &&
						(char1 === prevChar2) &&
						(prevChar1 === char2) &&
						(thisTransCost + 1 < currentCost)) {
						currentCost = thisTransCost + 1 // transposition
					}
				}

				char1Costs[j] = aboveCharCost = currentCost
			}
		}

		return currentCost
	}

	/// <summary>Internal implementation of the core Damerau-Levenshtein, optimal string alignment algorithm
	/// that accepts a maxDistance.</summary>
	/// <remarks>https://github.com/softwx/SoftWx.Match</remarks>
	_distanceMax (string1, string2, len1, len2, start, maxDistance, char1Costs, prevChar1Costs) {
		char1Costs = []

		for (let j = 0; j < len2; j++) {
			if (j < maxDistance) {
				char1Costs[j] = j + 1
			}
			else {
				char1Costs[j] = maxDistance + 1
			}
		}

		const lenDiff = len2 - len1
		const jStartOffset = maxDistance - lenDiff
		let jStart = 0
		let jEnd = maxDistance
		let char1 = ' '
		let currentCost = 0

		for (let i = 0; i < len1; ++i) {
			const prevChar1 = char1
			char1 = string1[start + i]
			let char2 = ' '
			let leftCharCost = i
			let aboveCharCost = i
			let nextTransCost = 0
			// no need to look beyond window of lower right diagonal - maxDistance cells (lower right diag is i - lenDiff)
			// and the upper left diagonal + maxDistance cells (upper left is i)
			jStart += (i > jStartOffset) ? 1 : 0
			jEnd += (jEnd < len2) ? 1 : 0

			for (let j = jStart; j < jEnd; ++j) {
				const thisTransCost = nextTransCost
				nextTransCost = prevChar1Costs[j]
				currentCost = leftCharCost
				prevChar1Costs[j] = leftCharCost // cost on diagonal (substitution)
				leftCharCost = char1Costs[j] // left now equals current cost (which will be diagonal at next iteration)
				const prevChar2 = char2
				char2 = string2[start + j]

				if (char1 !== char2) {
					// substitution if neither of two conditions below
					if (aboveCharCost < currentCost) {
						currentCost = aboveCharCost // deletion
					}

					if (leftCharCost < currentCost) {
						currentCost = leftCharCost // insertion
					}

					currentCost += 1

					if (i !== 0 && j !== 0 &&
						char1 === prevChar2 &&
						prevChar1 === char2 &&
						thisTransCost + 1 < currentCost) {
						currentCost = thisTransCost + 1 // transposition
					}
				}

				aboveCharCost = currentCost
				char1Costs[j] = currentCost
			}

			if (char1Costs[i + lenDiff] > maxDistance) {
				return -1
			}
		}

		return (currentCost <= maxDistance) ? currentCost : -1
	}
}

module.exports = EditDistance
