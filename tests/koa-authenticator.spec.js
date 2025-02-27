'use strict';

const getMiddleware = require('../index').authenticator;
const KeyPool = require('escher-keypool');
const Escher = require('escher-auth');
const AuthenticationError = require('../lib/error/authentication');


describe('Koa Escher Request Authenticator Middleware', function() {
  let next;
  let escherConfig;
  let escherStub;
  let loggerStub;


  const callMiddleware = function(context) {
    return getMiddleware(escherConfig, loggerStub)(context, next);
  };


  const createContext = function(data) {
    return {
      throw: sinon.stub(),
      request: {
        rawBody: data
      }
    };
  };


  beforeEach(function() {
    escherConfig = {
      credentialScope: 'testScope',
      keyPool: JSON.stringify([{ 'keyId': 'suite_cuda_v1', 'secret': 'testSecret', 'acceptOnly': 0 }])
    };

    next = sinon.stub();

    escherStub = {
      authenticate: this.sandbox.stub()
    };

    loggerStub = {
      error: sinon.stub()
    };

    this.sandbox.stub(Escher, 'create').returns(escherStub);
  });


  it('should throw error if context is invalid', async function() {
    const context = createContext();

    try {
      await callMiddleware(context);
    } catch (err) {
      expect(err.message).to.eql('Context is not decorated. Use koa-bodyparser middleware first.');
      expect(next).to.not.have.been.called;
      return;
    }

    throw new Error('should throw error');
  });


  it('should throw HTTP 401 in case of authentication problem', async function() {
    const error = new AuthenticationError('Test escher error');
    const resolvedData = Promise.resolve('test body');
    const context = createContext(resolvedData);
    escherStub.authenticate.throws(error);

    await callMiddleware(context);

    expect(context.throw).to.have.been.calledWith(401, 'Test escher error');
    expect(loggerStub.error).to.have.been.calledWith(
      'authentication_request_error',
      'Test escher error',
      sinon.match.instanceOf(AuthenticationError).and(sinon.match.has('message', 'Test escher error'))
    );
    expect(next).to.not.have.been.called;
  });


  it('should throw original error in case of problem during request', async function() {
    const expectedErrorMessage = 'Request capture error';

    const resolvedData = Promise.resolve('test body');
    const context = createContext(resolvedData);

    next.throws(new Error(expectedErrorMessage));

    try {
      await callMiddleware(context);
    } catch (error) {
      expect(error.message).to.be.eq(expectedErrorMessage);
      expect(loggerStub.error).to.not.have.been.called;
      return;
    }

    throw new Error('Should throw Error');
  });


  it('should await the "next" if there were no problem on authentication', async function() {
    const context = createContext('test body');

    await callMiddleware(context);

    expect(escherStub.authenticate).to.have.been.called;
    expect(next).to.have.been.called;
  });


  it('should supply the request data to escher without modification', async function() {
    const context = createContext('  test body  ');

    await callMiddleware(context);

    const expectedRequest = Object.create(context.request);
    expectedRequest.body = '  test body  ';

    expect(escherStub.authenticate).to.have.been.calledWithExactly(expectedRequest, sinon.match.any);
  });


  it('should use the proper keys using keypool from configuration', async function() {
    this.sandbox.stub(KeyPool, 'create').returns({
      getKeyDb: this.sandbox.stub().returns('testKey')
    });

    await callMiddleware(createContext(''));

    expect(KeyPool.create).to.have.been.calledWith(escherConfig.keyPool);
    expect(escherStub.authenticate).to.have.been.calledWithExactly(sinon.match.any, 'testKey');
  });


  describe('Escher library', function() {

    it('should be initialized with the proper Escher config', async function() {
      const fullConfig = {
        algoPrefix: 'EMS',
        vendorKey: 'EMS',
        authHeaderName: 'X-EMS-Auth',
        dateHeaderName: 'X-EMS-Date',
        credentialScope: 'testScope'
      };

      await callMiddleware(createContext(''));

      expect(Escher.create).to.have.been.calledWith(fullConfig);
    });

  });

});
