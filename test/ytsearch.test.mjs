import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePipedItems, parseYtApiItems, parseIsoDuration, cleanYoutubeTitle, PIPED_HOSTS } from "../dist/ytsearch.js";

describe("ytsearch pure", () => {
  it("parseIsoDuration PT3M20S", () => assert.equal(parseIsoDuration("PT3M20S"), 200));
  it("PT1H2M", () => assert.equal(parseIsoDuration("PT1H2M"), 3720));
  it("PT45S", () => assert.equal(parseIsoDuration("PT45S"), 45));
  it("P0D", () => assert.equal(parseIsoDuration("P0D"), 0));
  it("garbage", () => assert.equal(parseIsoDuration("garbage"), 0));
  it("PT1H", () => assert.equal(parseIsoDuration("PT1H"), 3600));
  it("PT2M", () => assert.equal(parseIsoDuration("PT2M"), 120));
  it("empty", () => assert.equal(parseIsoDuration(""), 0));

  it("cleanYoutubeTitle strips Official Video", () => assert.equal(cleanYoutubeTitle("Song (Official Video)"), "Song"));
  it("strips [Official Music Video]", () => assert.equal(cleanYoutubeTitle("Song [Official Music Video]"), "Song"));
  it("strips (Lyrics)", () => assert.equal(cleanYoutubeTitle("Song (Lyrics)"), "Song"));
  it("strips (HD)", () => assert.equal(cleanYoutubeTitle("Song (HD)"), "Song"));
  it("strips 4K Remaster", () => assert.equal(cleanYoutubeTitle("Song 4K Remaster"), "Song"));
  it("strips - Topic", () => assert.equal(cleanYoutubeTitle("Song - Topic"), "Song"));
  it("strips [HD]", () => assert.equal(cleanYoutubeTitle("Song [HD]"), "Song"));
  it("keeps original in edge", () => assert.ok(cleanYoutubeTitle("Hello World").includes("Hello")));

  it("parsePipedItems valid", () => {
    const j = { items: [{ url:"/watch?v=abc123", type:"stream", title:"T", thumbnail:"x", uploaderName:"Chan", duration:120, isShort:false }] };
    const out = parsePipedItems(j); assert.equal(out.length,1); assert.equal(out[0].videoId,"abc123");
  });
  it("parsePipedItems missing fields", () => {
    const j = { items: [{ url:"", type:"stream" }] }; assert.equal(parsePipedItems(j).length,0);
  });
  it("parsePipedItems shorts filtered", () => {
    const j = { items: [{ url:"/watch?v=a", type:"stream", title:"T", uploaderName:"C", duration:10, isShort:true }] }; assert.equal(parsePipedItems(j).length,0);
  });
  it("parsePipedItems live filtered", () => {
    const j = { items: [{ url:"/watch?v=a", type:"stream", title:"T", uploaderName:"C", duration:0 }] }; assert.equal(parsePipedItems(j).length,0);
  });
  it("parsePipedItems non-stream", () => {
    const j = { items: [{ url:"/watch?v=a", type:"channel" }] }; assert.equal(parsePipedItems(j).length,0);
  });
  it("parsePipedItems garbage", () => assert.deepEqual(parsePipedItems(null),[]));
  it("parsePipedItems duplicates", () => {
    const j = { items: [
      { url:"/watch?v=dup", type:"stream", title:"A", uploaderName:"C", duration:10, isShort:false },
      { url:"/watch?v=dup", type:"stream", title:"B", uploaderName:"C", duration:10, isShort:false }
    ]}; assert.equal(parsePipedItems(j).length,1);
  });
  it("parseYtApiItems basic", () => {
    const s = { items: [{ id:{videoId:"vid1"}, snippet:{title:"T", channelTitle:"C"}}]};
    const c = { items: [{ id:"vid1", contentDetails:{duration:"PT3M"}}]};
    const out = parseYtApiItems(s,c); assert.equal(out.length,1); assert.equal(out[0].duration,180);
  });
  it("PIPED_HOSTS has 4", () => assert.equal(PIPED_HOSTS.length,4));
});
