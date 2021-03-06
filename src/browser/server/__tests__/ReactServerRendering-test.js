/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @jsx React.DOM
 * @emails react-core
 */

/*jslint evil: true */

"use strict";

require('mock-modules')
  .dontMock('ExecutionEnvironment')
  .dontMock('React')
  .dontMock('ReactMount')
  .dontMock('ReactServerRendering')
  .dontMock('ReactTestUtils')
  .dontMock('ReactMarkupChecksum');

var mocks = require('mocks');

var React;
var ReactMount;
var ReactTestUtils;
var ReactServerRendering;
var ReactMarkupChecksum;
var ExecutionEnvironment;

var ID_ATTRIBUTE_NAME;

describe('ReactServerRendering', function() {
  beforeEach(function() {
    require('mock-modules').dumpCache();
    React = require('React');
    ReactMount = require('ReactMount');
    ReactTestUtils = require('ReactTestUtils');
    ExecutionEnvironment = require('ExecutionEnvironment');
    ExecutionEnvironment.canUseDOM = false;
    ReactServerRendering = require('ReactServerRendering');
    ReactMarkupChecksum = require('ReactMarkupChecksum');

    var DOMProperty = require('DOMProperty');
    ID_ATTRIBUTE_NAME = DOMProperty.ID_ATTRIBUTE_NAME;
  });

  it('should generate simple markup', function() {
    var response = ReactServerRendering.renderComponentToString(
      <span>hello world</span>
    );
    expect(response).toMatch(
      '<span ' + ID_ATTRIBUTE_NAME + '="[^"]+" ' +
        ReactMarkupChecksum.CHECKSUM_ATTR_NAME + '="[^"]+">hello world</span>'
    );
  });

  it('should not register event listeners', function() {
    var EventPluginHub = require('EventPluginHub');
    var cb = mocks.getMockFunction();

    var response = ReactServerRendering.renderComponentToString(
      <span onClick={cb}>hello world</span>
    );
    expect(EventPluginHub.__getListenerBank()).toEqual({});
  });

  it('should render composite components', function() {
    var Parent = React.createClass({
      render: function() {
        return <div><Child name="child" /></div>;
      }
    });
    var Child = React.createClass({
      render: function() {
        return <span>My name is {this.props.name}</span>;
      }
    });
    var response = ReactServerRendering.renderComponentToString(
      <Parent />
    );
    expect(response).toMatch(
      '<div ' + ID_ATTRIBUTE_NAME + '="[^"]+" ' +
        ReactMarkupChecksum.CHECKSUM_ATTR_NAME + '="[^"]+">' +
        '<span ' + ID_ATTRIBUTE_NAME + '="[^"]+">' +
          '<span ' + ID_ATTRIBUTE_NAME + '="[^"]+">My name is </span>' +
          '<span ' + ID_ATTRIBUTE_NAME + '="[^"]+">child</span>' +
        '</span>' +
      '</div>'
    );
  });

  it('should only execute certain lifecycle methods', function() {
    var lifecycle = [];
    var TestComponent = React.createClass({
      componentWillMount: function() {
        lifecycle.push('componentWillMount');
      },
      componentDidMount: function() {
        lifecycle.push('componentDidMount');
      },
      getInitialState: function() {
        lifecycle.push('getInitialState');
        return {name: 'TestComponent'};
      },
      render: function() {
        lifecycle.push('render');
        return <span>Component name: {this.state.name}</span>;
      },
      componentWillUpdate: function() {
        lifecycle.push('componentWillUpdate');
      },
      componentDidUpdate: function() {
        lifecycle.push('componentDidUpdate');
      },
      shouldComponentUpdate: function() {
        lifecycle.push('shouldComponentUpdate');
      },
      componentWillReceiveProps: function() {
        lifecycle.push('componentWillReceiveProps');
      },
      componentWillUnmount: function() {
        lifecycle.push('componentWillUnmount');
      }
    });

    var response = ReactServerRendering.renderComponentToString(
      <TestComponent />
    );

    expect(response).toMatch(
      '<span ' + ID_ATTRIBUTE_NAME + '="[^"]+" ' +
        ReactMarkupChecksum.CHECKSUM_ATTR_NAME + '="[^"]+">' +
        '<span ' + ID_ATTRIBUTE_NAME + '="[^"]+">Component name: </span>' +
        '<span ' + ID_ATTRIBUTE_NAME + '="[^"]+">TestComponent</span>' +
      '</span>'
    );
    expect(lifecycle).toEqual(
      ['getInitialState', 'componentWillMount', 'render']
    );
  });

  it('should have the correct mounting behavior', function() {
    // This test is testing client-side behavior.
    ExecutionEnvironment.canUseDOM = true;

    var mountCount = 0;
    var numClicks = 0;

    var TestComponent = React.createClass({
      componentDidMount: function() {
        mountCount++;
      },
      click: function() {
        numClicks++;
      },
      render: function() {
        return (
          <span ref="span" onClick={this.click}>Name: {this.props.name}</span>
        );
      }
    });

    var element = document.createElement('div');
    React.renderComponent(<TestComponent />, element);

    var lastMarkup = element.innerHTML;

    // Exercise the update path. Markup should not change,
    // but some lifecycle methods should be run again.
    React.renderComponent(<TestComponent name="x" />, element);
    expect(mountCount).toEqual(1);

    // Unmount and remount. We should get another mount event and
    // we should get different markup, as the IDs are unique each time.
    React.unmountComponentAtNode(element);
    expect(element.innerHTML).toEqual('');
    React.renderComponent(<TestComponent name="x" />, element);
    expect(mountCount).toEqual(2);
    expect(element.innerHTML).not.toEqual(lastMarkup);

    // Now kill the node and render it on top of server-rendered markup, as if
    // we used server rendering. We should mount again, but the markup should be
    // unchanged. We will append a sentinel at the end of innerHTML to be sure
    // that innerHTML was not changed.
    React.unmountComponentAtNode(element);
    expect(element.innerHTML).toEqual('');

    ExecutionEnvironment.canUseDOM = false;
    lastMarkup = ReactServerRendering.renderComponentToString(
      <TestComponent name="x" />
    );
    ExecutionEnvironment.canUseDOM = true;
    element.innerHTML = lastMarkup + ' __sentinel__';

    React.renderComponent(<TestComponent name="x" />, element);
    expect(mountCount).toEqual(3);
    expect(element.innerHTML.indexOf('__sentinel__') > -1).toBe(true);
    React.unmountComponentAtNode(element);
    expect(element.innerHTML).toEqual('');

    // Now simulate a situation where the app is not idempotent. React should
    // warn but do the right thing.
    var _warn = console.warn;
    console.warn = mocks.getMockFunction();
    element.innerHTML = lastMarkup;
    var instance = React.renderComponent(<TestComponent name="y" />, element);
    expect(mountCount).toEqual(4);
    expect(console.warn.mock.calls.length).toBe(1);
    expect(element.innerHTML.length > 0).toBe(true);
    expect(element.innerHTML).not.toEqual(lastMarkup);
    console.warn = _warn;

    // Ensure the events system works
    expect(numClicks).toEqual(0);
    ReactTestUtils.Simulate.click(instance.refs.span.getDOMNode());
    expect(numClicks).toEqual(1);
  });

  it('should throw with silly args', function() {
    expect(
      ReactServerRendering.renderComponentToString.bind(
        ReactServerRendering,
        'not a component'
      )
    ).toThrow(
      'Invariant Violation: renderComponentToString(): You must pass ' +
      'a valid ReactComponent.'
    );
  });

  it('should provide guidance for breaking API changes', function() {
    expect(
      ReactServerRendering.renderComponentToString.bind(
        ReactServerRendering,
        <div />,
        function(){}
      )
    ).toThrow(
      'Invariant Violation: renderComponentToString(): This function became ' +
      'synchronous and now returns the generated markup. Please remove the ' +
      'second parameter.'
    );
  });
});
