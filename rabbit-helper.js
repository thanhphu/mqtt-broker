// Selects rabbitMQ with least connection
const _ = require('lodash');
const request = require('request');
const async = require('async');

/**
 * hosts: array of hosts to query from
 * type: type of least connection to select, available types:
 *    'publisher': when called from mosca
 *    'subscriber': when called from collector
 * connect: connection callback, takes one parameter - hostname of selected node
 */
module.exports.selectRabbit = function (hosts, type, connect) {
    _getNodesInfo(hosts, 'subscriber');

    function _callQueueApi(host, cb) {
        const url = `http://guest:guest@${host}:15672/api/queues`;
        request({
            url: url,
            json: true
        }, function (error, response, body) {
            if (!error && response.statusCode === 200) {
                cb(body);
            }
        });
    }
    
    function _getNodesInfo(hosts, type) {
        var found = false;
        _.each(hosts, (host) => {
            _callQueueApi(host, (body) => {
                if (body && !found) {
                    _selectNode(body, type);
                    found = true;
                }
            });
        });
    }

    function _selectNode(nodesInfo, type) {
        if (nodesInfo) {
            // Count of all types of conection to all nodes
            // Example: Object {rabbit@rabbit1: 2, rabbit@rabbit2: 1, rabbit@rabbit3: 1}
            var allCount = _.countBy(nodesInfo, (node) => node.node);
            if (type === 'publisher') {
                // Mosca makes non-durable queues, keep durable queues
                _.remove(nodesInfo, (node) => node.durable == true);
            } else {
                // We use durable queues in consumers
                _.remove(nodesInfo, (node) => node.durable == false);
            }
            // Count of only the connection type we want
            var typeCount = _.countBy(nodesInfo, (node) => node.node);

            var leastConnectedNode = _selectLeastConnectedNode(allCount, typeCount);
            var leastConnectedNodeName = _extractHostName(leastConnectedNode);
            connect(leastConnectedNodeName);
        }
    }
    
    function _selectLeastConnectedNode(allCount, typeCount) {
        // Add back nodes with zero connections
        var leastConnectedCount, leastConnectedNode;
        _.forEach(allCount, (value, key) => {
            
            if (!typeCount[key]) {
                typeCount[key] = 0;
            }

            // Select node with least connections
            if (leastConnectedCount === undefined) {
                leastConnectedCount = value;
            }

            if (leastConnectedCount >= typeCount[key]) {
                leastConnectedCount = typeCount[key];
                leastConnectedNode = key;
            }
        });
        return leastConnectedNode;
    }

    function _extractHostName(longNodeName) {
        return longNodeName.split('@')[1];
    }
};