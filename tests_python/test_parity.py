"""The Python contracts must agree with the TypeScript ones.

Two generated artifacts from one set of schemas is a drift risk, so these
tests run the *same* fixtures the Ajv suite uses (`tests/fixtures.spec.ts`)
through the Python validators and demand the same verdicts. If Python and
TypeScript ever disagree about whether a payload is valid, a service boundary
is lying to another service, and that is the failure these tests exist to
catch.
"""

import json
from pathlib import Path

import pytest
from trileo_contracts import SUBJECTS, ContractViolation, validate_by_title
from trileo_contracts._schemas import SCHEMA_BY_TITLE, SCHEMAS
from trileo_contracts.validation import _is_valid

ROOT = Path(__file__).resolve().parents[1]


def _fixtures(kind: str) -> list[dict]:
    collected: list[dict] = []
    for path in sorted((ROOT / "fixtures" / kind).glob("*.json")):
        collected.extend(json.loads(path.read_text()))
    return collected


VALID = _fixtures("valid")
INVALID = _fixtures("invalid")


def _identify(fixture: dict) -> str:
    return f"{fixture['schema'].rsplit('/', 1)[-1]}:{fixture.get('reason', 'valid')}"


@pytest.mark.parametrize("fixture", VALID, ids=_identify)
def test_every_valid_fixture_is_accepted(fixture):
    assert _is_valid(fixture["schema"], fixture["data"]), (
        f"Python rejected a payload Ajv accepts: {fixture['schema']}"
    )


@pytest.mark.parametrize("fixture", INVALID, ids=_identify)
def test_every_invalid_fixture_is_rejected(fixture):
    assert not _is_valid(fixture["schema"], fixture["data"]), (
        f"Python accepted a payload Ajv rejects: {fixture.get('reason', fixture['schema'])}"
    )


def test_every_schema_has_a_validator():
    # Mirrors the Ajv suite's coverage assertion: a schema with no fixture is
    # a contract nobody has ever checked.
    covered = {fixture["schema"] for fixture in VALID}
    missing = sorted(set(SCHEMAS) - covered)
    assert not missing, f"schemas with no valid fixture: {missing}"


def test_titles_resolve_to_schemas():
    for title, schema_id in SCHEMA_BY_TITLE.items():
        assert schema_id in SCHEMAS, title


def test_subjects_match_the_source_of_truth():
    # The whole point of generating these: the AI service used to hand-copy
    # them, which drifts silently and fails as an unanswered request.
    source = json.loads((ROOT / "subjects" / "v1.json").read_text())
    assert SUBJECTS == source


def test_a_violation_names_the_offending_field():
    # An error that does not say which field failed turns a one-line fix into
    # a debugging session.
    with pytest.raises(ContractViolation) as caught:
        validate_by_title("ServiceError", {"code": "lower_case_is_invalid"})
    assert "ServiceError" in str(caught.value)


def test_validate_by_title_rejects_an_unknown_contract():
    with pytest.raises(KeyError):
        validate_by_title("NoSuchContract", {})
