def extract_and_map_fields(data: dict, map: dict) -> dict:
    """
    Extracts and maps fields from the provided data based on the given mapping.

    Args:
        data (dict): The data dictionary from which to extract fields.
        map (dict): The mapping of keys to extract from the data.

    Returns:
        dict: A dictionary containing the extracted and mapped fields.
    """
    extracted_data = {}
    for key, field in map.items():
        if "." in key:
            top_level_key, nested_key = key.split(".")
            top_level_data = data.get(top_level_key, {})
            extracted_data[field] = (
                top_level_data.get(nested_key)
                if isinstance(top_level_data, dict)
                else None
            )
        else:
            extracted_data[field] = data.get(key)
    return extracted_data
