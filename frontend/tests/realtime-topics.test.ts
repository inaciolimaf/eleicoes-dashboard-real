import { describe, expect, it } from "vitest";
import { topic } from "../src/modules/realtime";

// Topic names must match the backend (`backend/app/infra/realtime/topics.py`) byte for byte.
describe("realtime topic names", () => {
  it("names the results of an area", () => {
    expect(topic.results(1, 1, "state", "sp")).toBe("results:1:1:state:sp");
  });

  it("names the children of an area, with the child level only for the municipalities of the country", () => {
    expect(topic.children(1, 5, "state", "sp")).toBe("children:1:5:state:sp");
    expect(topic.children(1, 5, "country", "br", "municipality")).toBe(
      "children:1:5:country:br:municipality",
    );
    expect(topic.children(1, 5, "country", "br", "state")).toBe("children:1:5:country:br");
    expect(topic.children(1, 5, "country", "br")).toBe("children:1:5:country:br");
  });

  it("names the polling places of a municipality, the progress, the events and the status", () => {
    expect(topic.pollingPlaces(2, 1, "3550308")).toBe("polling_places:2:1:3550308");
    expect(topic.progress(2)).toBe("progress:2");
    expect(topic.events(2)).toBe("events:2");
    expect(topic.status()).toBe("status");
  });
});
