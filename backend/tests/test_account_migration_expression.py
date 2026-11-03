"""Exact constraint semantics; PostgreSQL migration acceptance remains separate."""
from scripts.migrate_accounts import expression


def test_postgresql_language_expression_matches_required_values():
    assert expression("preferred_language IN ('en', 'ms')") == expression(
        "((preferred_language)::text = ANY ((ARRAY['en'::character varying, 'ms'::character varying])::text[]))")


def test_language_literal_case_cannot_be_normalized_into_compliance():
    assert expression("preferred_language IN ('en', 'ms')") != expression(
        "preferred_language IN ('EN', 'MS')")


def test_literal_spaces_parentheses_and_escaped_quotes_are_preserved():
    assert expression("name = 'a (b)''c'") != expression("name = 'ab''c'")
    assert expression("name = 'a b'") != expression("name = 'ab'")
    assert expression('version BETWEEN 1 AND 80') == expression('((version >= 1) AND (version <= 80))')
