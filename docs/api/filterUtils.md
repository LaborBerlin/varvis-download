# API Reference

##

parseFilterExpression

    Parses a filter expression like &#x27;analysisType&#x3D;SNV&#x27; or &#x27;sampleId&gt;LB24-0001&#x27;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `filterExpression` | `string` |
      The filter expression (e.g., analysisType=SNV)
      |

    ### Returns **Type:** `Object`

      - An object containing field, operator, and value (e.g., { field: 'analysisType', operator: '=', value: 'SNV' })

---

##

applyFilter

    Applies a single filter to a list of analyses

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `analyses` | `Array` |
      List of analyses returned by the API
      |
      | `filter` | `Object` |
      Parsed filter object (e.g., { field: 'analysisType', operator: '=', value: 'SNV' })
      |

    ### Returns **Type:** `Array`

      - Filtered list of analyses

---

##

applyFilters

    Applies multiple filters to a list of analyses

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `analyses` | `Array` |
      List of analyses returned by the API
      |
      | `filterExpressions` | `Array` |
      Array of filter expressions (e.g., ['analysisType=SNV', 'sampleId>LB24-0001'])
      |

    ### Returns **Type:** `Array`

      - Filtered list of analyses

---
