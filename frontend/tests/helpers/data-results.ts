import type {
  AllianceDto,
  CandidateDetailDto,
  CandidateDto,
  CandidateResultDto,
  ChildCandidateDto,
  ChildItemDto,
  ChildrenDto,
  ElectionDto,
  GeoAreaDto,
  OfficeDto,
  ProgressDto,
  ProgressItemDto,
  ResultsWithDataDto,
  SeriesDto,
  TotalsDto,
} from "../../src/api/models";

/**
 * Fixture builder: the test lists the fields it cares about. The code under test reads only those,
 * so the fixture is a partial DTO typed as the whole one.
 */
export function dto<T>(fields: Partial<T>): T {
  return fields as T;
}

export function totals(overrides: Partial<TotalsDto> = {}): TotalsDto {
  return dto<TotalsDto>({
    electorate: 1000,
    tallied_electorate: 800,
    sections_total: 10,
    sections_tallied: 8,
    pct_sections: 80,
    valid_votes: 700,
    blank_votes: 20,
    null_votes: 30,
    total_votes: 750,
    turnout: 750,
    abstention: 250,
    pct_turnout: 75,
    pct_abstention: 25,
    pct_valid: 93.33,
    pct_blank: 2.67,
    pct_null: 4,
    ...overrides,
  });
}

export function office(overrides: Partial<OfficeDto> = {}): OfficeDto {
  return dto<OfficeDto>({
    office_code: 1,
    name: "Presidente",
    voting_system: "majoritario",
    seats: 1,
    coverage: "country",
    ...overrides,
  });
}

export function geoArea(overrides: Partial<GeoAreaDto> = {}): GeoAreaDto {
  return dto<GeoAreaDto>({
    level: "country",
    id: "br",
    name: "Brasil",
    state_code: null,
    breadcrumb: [{ level: "country", id: "br", name: "Brasil" }],
    ...overrides,
  });
}

export function candidateResult(overrides: Partial<CandidateResultDto> = {}): CandidateResultDto {
  return dto<CandidateResultDto>({
    tse_candidate_id: "100001",
    ballot_number: 13,
    name: "Maria Silva",
    ballot_name: "Maria Silva",
    party_abbreviation: "PT",
    party_number: 13,
    alliance: null,
    color: "#D7191C",
    photo_url: "",
    votes: 5000,
    valid_pct: 50,
    position: 1,
    status: "LEADING",
    overall_status: "COUNTING",
    elected: false,
    vote_destination: "Válido",
    vice_and_substitutes: [],
    ...overrides,
  });
}

export function alliance(overrides: Partial<AllianceDto> = {}): AllianceDto {
  return dto<AllianceDto>({
    name: "Frente",
    parties: ["PT"],
    votes: 1000,
    seats: 2,
    color: "#D7191C",
    ...overrides,
  });
}

export function results(overrides: Partial<ResultsWithDataDto> = {}): ResultsWithDataDto {
  return dto<ResultsWithDataDto>({
    no_data: false,
    geo_area: geoArea(),
    office: office(),
    source: "tse",
    coverage: null,
    generation_id: "idg-1",
    tallied_at: "2026-10-04T20:00:00Z",
    captured_at: "2026-10-04T20:01:00Z",
    jws_verified: true,
    totals: totals(),
    mathematically_decided: false,
    final_tally: false,
    leader: null,
    candidates: [
      candidateResult({
        tse_candidate_id: "100001",
        ballot_name: "Maria Silva",
        votes: 5000,
        valid_pct: 50,
        position: 1,
      }),
      candidateResult({
        tse_candidate_id: "100002",
        ballot_number: 45,
        ballot_name: "João Souza",
        party_abbreviation: "PSDB",
        color: "#0B3D91",
        votes: 3000,
        valid_pct: 30,
        position: 2,
        status: "NOT_ELECTED",
      }),
      candidateResult({
        tse_candidate_id: "100003",
        ballot_number: 30,
        ballot_name: "Ana Lima",
        party_abbreviation: "NOVO",
        color: "#F26522",
        votes: 2000,
        valid_pct: 20,
        position: 3,
        status: "NOT_ELECTED",
      }),
    ],
    alliances: [],
    ...overrides,
  });
}

export function childItem(overrides: Partial<ChildItemDto> = {}): ChildItemDto {
  return dto<ChildItemDto>({
    level: "state",
    id: "sp",
    name: "São Paulo",
    state_code: "sp",
    ibge_code: 35,
    region: "Sudeste",
    is_capital: false,
    lat: null,
    lon: null,
    status: "tallied",
    pct_sections: 100,
    electorate: 34000000,
    turnout: 25000000,
    pct_abstention: 26,
    valid_votes: 22000000,
    blank_votes: 1000000,
    null_votes: 2000000,
    leader: {
      tse_candidate_id: "100001",
      ballot_name: "Maria Silva",
      color: "#D7191C",
      ballot_number: 13,
      party_abbreviation: "PT",
      votes: 9000000,
      pct: 41,
    },
    second: {
      tse_candidate_id: "100002",
      ballot_name: "João Souza",
      color: "#0B3D91",
      ballot_number: 45,
      party_abbreviation: "PSDB",
      votes: 8000000,
      pct: 36,
    },
    margin_pp: 5,
    leader_party: { abbreviation: "PT", color: "#1F6FB2" },
    values: { "100001": 41, "100002": 36 },
    ...overrides,
  });
}

export function childCandidate(overrides: Partial<ChildCandidateDto> = {}): ChildCandidateDto {
  return dto<ChildCandidateDto>({
    tse_candidate_id: "100001",
    ballot_name: "Maria Silva",
    color: "#D7191C",
    ballot_number: 13,
    party_abbreviation: "PT",
    wins: 1,
    ...overrides,
  });
}

export function children(
  items: ChildItemDto[],
  candidates: ChildCandidateDto[] = [],
  childLevel = "state",
): ChildrenDto {
  return dto<ChildrenDto>({ child_level: childLevel, candidates, items });
}

export function candidate(overrides: Partial<CandidateDto> = {}): CandidateDto {
  return dto<CandidateDto>({
    tse_candidate_id: "100001",
    ballot_number: 13,
    name: "Maria Silva",
    ballot_name: "Maria Silva",
    party_abbreviation: "PT",
    alliance: null,
    color: "#D7191C",
    photo_url: "",
    state_code: null,
    office_code: 1,
    office_name: "Presidente",
    overall_status: "COUNTING",
    elected: false,
    vice_and_substitutes: [],
    ...overrides,
  });
}

export function candidateDetail(overrides: Partial<CandidateDetailDto> = {}): CandidateDetailDto {
  return dto<CandidateDetailDto>({
    ...candidate(),
    office: office(),
    result: { votes: 5000, valid_pct: 50, position: 1, status: "LEADING" },
    ...overrides,
  });
}

export function progressItem(overrides: Partial<ProgressItemDto> = {}): ProgressItemDto {
  return dto<ProgressItemDto>({
    state_code: "sp",
    name: "São Paulo",
    pct_sections: 90,
    sections_tallied: 900,
    sections_total: 1000,
    pct_turnout: 80,
    municipalities_completed: 600,
    municipalities_partial: 10,
    municipalities_not_received: 5,
    tallied_at: "2026-10-04T20:00:00Z",
    ...overrides,
  });
}

export function progress(items: ProgressItemDto[] = [progressItem()]): ProgressDto {
  return dto<ProgressDto>({
    country: { pct_sections: 60, sections_tallied: 600, sections_total: 1000, tallied_at: null },
    items,
  });
}

export function series(overrides: Partial<SeriesDto> = {}): SeriesDto {
  return dto<SeriesDto>({
    candidates: [
      {
        tse_candidate_id: "100001",
        ballot_name: "Maria Silva",
        color: "#D7191C",
        ballot_number: 13,
        party_abbreviation: "PT",
      },
      {
        tse_candidate_id: "100002",
        ballot_name: "João Souza",
        color: "#0B3D91",
        ballot_number: 45,
        party_abbreviation: "PSDB",
      },
    ],
    points: [
      {
        time: "2026-10-04T18:00:00Z",
        pct_sections: 10,
        valid_votes: 1000,
        candidates: {
          "100001": { votes: 500, pct: 50 },
          "100002": { votes: 300, pct: 30 },
        },
      },
      {
        time: "2026-10-04T19:00:00Z",
        pct_sections: 60,
        valid_votes: 6000,
        candidates: {
          "100001": { votes: 3300, pct: 55 },
          "100002": { votes: 1800, pct: 30 },
        },
      },
    ],
    events: [],
    ...overrides,
  });
}

export function elections(offices: OfficeDto[] = [office()]): ElectionDto[] {
  return [dto<ElectionDto>({ id: 1, round: 1, cycle: "2026", offices })];
}
