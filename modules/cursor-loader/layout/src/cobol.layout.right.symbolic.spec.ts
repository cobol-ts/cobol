import {valueOrThrow} from "@cobol-ts/errors";
import {type CopybookAst, type ElementaryEntry, type GroupEntry, type CopybookClause} from "@cobol-ts/copybook";
import {evaluateStorageSize, canonicaliseStorageSize, type StorageSizeExpression} from "@cobol-ts/size";
import {compileCobolLayout} from "./cobol.layout";
const named = (name: string) => ({kind: "named" as const, name});
const field = (name:string, clauses:CopybookClause[]=[]):ElementaryEntry => ({kind:"elementary",level:5,name:named(name),picture:name==="ALIGNED"?"9(4)":"X",clauses,conditions:[],line:2});
const group=(name:string,children:(ElementaryEntry|GroupEntry)[]):GroupEntry=>({kind:"group",level:1,name:named(name),children,clauses:[],line:1});
const variable:StorageSizeExpression={kind:"depending-on",path:["REC","COUNT"],expression:8};
function compile(...children:(ElementaryEntry|GroupEntry)[]){
 const ast:CopybookAst={metadata:{},entries:[group("REC",children)]};
 const result=valueOrThrow(compileCobolLayout(ast,"symbolic.cpy",{primitiveSizer:(_,c)=>({value:c.path.at(-1)==="VARIABLE"? variable: c.path.at(-1)==="ALIGNED"?16:8})}))[0];
 if(result.kind!=="group") throw Error("expected group");return result;
}
const evalAt=(expr:StorageSizeExpression,count:number)=>evaluateStorageSize(expr,()=>count);
describe("symbolic right geometry",()=>{
 test("symbolic variable before fixed suffix",()=>{
  const rec=compile(field("COUNT"),field("VARIABLE"),field("TAIL"));
  const [count,variableNode,tail]=rec.children;
  for(const n of [0,1,2,7]){
   expect(evalAt(count.rightOffset,n)).toBe(8*n+8);
   expect(evalAt(variableNode.rightOffset,n)).toBe(8);
   expect(evalAt(tail.rightOffset,n)).toBe(0);
  }
 });
 test("right offset with symbolic synchronization padding",()=>{
  const rec=compile(field("COUNT"),field("VARIABLE"),field("ALIGNED",[{kind:"usage",usage:"COMP"},{kind:"synchronized"}]));
  const [head,variableNode]=rec.children;
  for(const n of [0,1,2,7]){
   const before=8+n*8, pad=(16-before%16)%16;
   expect(evalAt(head.rightOffset,n)).toBe(n*8+pad+16);
   expect(evalAt(variableNode.rightOffset,n)).toBe(pad+16);
  }
 });
 test("unequal symbolic overlay alternatives and suffix",()=>{
  const rec=compile(field("VARIABLE"),field("ALT",[{kind:"redefines",target:"VARIABLE"}]),field("TAIL"));
  const [variableNode,alt,tail]=rec.children;
  for(const n of [0,1,2,4]){
   const extent=Math.max(8*n,8);
   expect(evalAt(rec.size,n)).toBe(extent+8);
   expect(evalAt(variableNode.rightOffset,n)).toBe(extent-8*n+8);
   expect(evalAt(alt.rightOffset,n)).toBe(extent-8+8);
   expect(evalAt(tail.rightOffset,n)).toBe(0);
  }
 });
 test("nested first-field alignment is owned once and right offsets stay correct",()=>{
  const rec=compile(field("VARIABLE"),group("INNER",[field("ALIGNED",[{kind:"usage",usage:"COMP"},{kind:"synchronized"}]),field("TAIL")]));
  const inner=rec.children.find(c=>c.kind==="group");
  if(!inner || inner.kind!=="group")throw Error("expected nested group");
  expect(inner.children.filter(c=>c.kind==="padding").length).toBe(0);
  expect(rec.children.filter(c=>c.kind==="padding").length).toBe(1);
  for(const n of [0,1,2,3]){
    const pad=(16-(8*n)%16)%16;
    expect(evalAt(rec.size,n)).toBe(8*n+pad+24);
    expect(evalAt(inner.rightOffset,n)).toBe(0);
    expect(evalAt(inner.children[0].rightOffset,n)).toBe(8);
  }
 });
 test("nested symbolic overlay offsets are relative to their own containing group",()=>{
  const rec=compile(field("COUNT"),group("INNER",[
    field("VARIABLE"),field("ALT",[{kind:"redefines",target:"VARIABLE"}]),field("TAIL")
  ]),field("AFTER"));
  const inner=rec.children.find(c=>c.kind==="group");
  if(!inner || inner.kind!=="group")throw Error("expected nested group");
  const [variableNode,alt,tail]=inner.children;
  for(const n of [0,1,3]){
    const extent=Math.max(8*n,8);
    expect(evalAt(inner.size,n)).toBe(extent+8);
    expect(evalAt(variableNode.rightOffset,n)).toBe(extent-8*n+8);
    expect(evalAt(alt.rightOffset,n)).toBe(extent-8+8);
    expect(evalAt(tail.rightOffset,n)).toBe(0);
    expect(evalAt(inner.rightOffset,n)).toBe(8);
  }
 });
 test("canonical difference does not discard symbolic max-minus-alternative",()=>{
   const x=canonicaliseStorageSize({kind:"difference",left:{kind:"max",terms:[variable,8]},right:variable});
   for(const n of [0,1,2,5])expect(evalAt(x,n)).toBe(Math.max(8*n,8)-8*n);
 });
});
