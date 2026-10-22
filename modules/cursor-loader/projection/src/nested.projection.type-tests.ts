import {type ProjectedArray} from "@cobol-ts/arrays";
import {defineProjection} from "./create.projection";
interface Item { sku():string; count():number }
interface Customer { name():string; readonly items:ProjectedArray<Item> }
const valid=defineProjection<Customer>({
    name:{type:"string"},
    items:{type:"array",element:{sku:{type:"string"},count:{type:"integer"}}}
});
void valid;
// @ts-expect-error string methods cannot be projected as an integer
const invalidScalar=defineProjection<Customer>({name:{type:"integer"},items:{type:"array",element:{sku:{type:"string"},count:{type:"integer"}}}});
// @ts-expect-error array children must satisfy the application element interface
const invalidChild=defineProjection<Customer>({name:{type:"string"},items:{type:"array",element:{sku:{type:"integer"},count:{type:"integer"}}}});
void invalidScalar;void invalidChild;
