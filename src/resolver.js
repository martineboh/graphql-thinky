import thinkySchema from 'thinky-export-schema';
import simplifyAST from './simplifyAST';
import generateTree from './generateTree';
import {argsToFindOptions} from './queryBuilder';
import {isConnection,nodeAST,nodeType} from './relay';
import {
    GraphQLList
} from 'graphql';

/**
 * Resolver Constructor
 *
 * @param Node
 * @param opts
 * @returns {Resolver}
 */
export default function resolver(Node,opts = {}) {

  if (opts.before === undefined) opts.before = (opts) => opts;
  if (opts.after === undefined) opts.after = (opts) => opts;

  const Model = Node.getModel();

  const modelSchema    = thinkySchema(Model);
  const modelRelations = Object.keys(modelSchema.relationships);

  /**
   * Resolver GraphQL
   *
   * @param source
   * @param args
   * @param context
   * @param info
   * @constructor
   */
  const Resolver = async (source, args, context, info) => {

    Node.name = info.fieldName;

    let simplyAST = simplifyAST(info.fieldASTs[0], info);
    const findOptions = argsToFindOptions(args,Model);

    let nodeArgs = {
      attributes: [],
      list: true,
      thinky: null,
      filter: {},
      limit: undefined,
      skip: undefined,
      order: undefined,
      ...findOptions,
    };

    let fields = simplyAST.fields;
    let type = info.returnType;

    if (isConnection(info.returnType)) {
      simplyAST = nodeAST(simplyAST);
      fields = simplyAST.fields;
      type = nodeType(type);
    }

    nodeArgs = opts.before(nodeArgs, args, context, {
      ...info,
      ast: simplyAST,
      type: type,
      source: source
    });

    nodeArgs.thinky = opts.thinky;
    nodeArgs.list = opts.list || type instanceof GraphQLList;
    nodeArgs.attributes = Object.keys(fields).filter(field => {
      return (modelRelations.indexOf(field) === -1) &&
          modelSchema.fields.hasOwnProperty(field) &&
          modelSchema.fields[field] !== 'Virtual';
    }).concat(['id']);

    type = type.ofType || type;

    if (!Node.isRelated()) {

      const tree = generateTree(
          simplyAST,
          type,
          context
      );

      Node.setTree(tree);
    }

    Node.setArgs(nodeArgs);

    const result = await Node.generateDataTree(source);

    return opts.after(result, args, context, {
      ...info,
      ast: simplyAST,
      type: type,
      source: source
    });
  };

  Resolver.$Node = Node;
  Resolver.$before = opts.before;
  Resolver.$after = opts.after;
  Resolver.$options = opts;

  return Resolver;
}