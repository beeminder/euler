// --------------------------------- 80chars ---------------------------------->

var app = angular.module('workerbee', []);

app.controller("goalConnect", goalConnect);

goalConnect.$inject = ["$scope", "$http"];

function goalConnect($scope, $http) {
  
  $scope.currentStage = 'initialScreen';
  $scope.goals = null;
  $scope.beeGoals = null;
  $scope.newConnection = {};
  
  function init () {
    
    $http({
      method: 'get',
      url: '/get-links'
    }).then( (result) => {
      $scope.goals = result.data.goals;
      $scope.connections = result.data.connections;
      $scope.beeminderGoals = result.data.beeGoals;
      $scope.currentStage = 'goalsList';
      $scope.action = 'Continue';
      $scope.newConnection = {};
    });
    
  }
  
  init();
  
  $scope.deleteLink = (id) => {
    var c = confirm ("Do you really want to delete this connection?")
    if(c){
      $http({
        method: 'get',
        url: '/delete-link?id=' + id
      }).then( (result) => {
        init();
      });
    }
  }
  
  $scope.addConnection = (type) => {
    $scope.currentStage = 'new'+type;
    $scope.action = 'Continue';
    $scope.sourceError = null;
    $scope.targetError = null;
  }
  
  $scope.cancelConnection = () => {
    init();
  }
  
  $scope.submitConnection = (type) => {
    $('#actionButton').addClass("disabled");
    $http({
      method: 'POST',
      url: '/setup-link',
      data: {linktype: type, 
             newConnection: $scope.newConnection, 
             action: $scope.action}
    }).then( (result)=> {
      $('#actionButton').removeClass("disabled");
      if($scope.action == 'Save') {
        init();
        return;
      }
      $scope.beeminderGoals = result.data.beeGoals;
      $scope.newConnection = result.data.newConnection;
      $scope.targetError = result.data.targetError;
      $scope.sourceError = result.data.sourceError;
      if (typeof $scope.newConnection.startValue != "undefined" && 
          typeof $scope.sourceError == "undefined" && 
          typeof $scope.targetError == "undefined") { 
        $scope.action = 'Save' 
      } else { 
        $scope.action = 'Continue' 
      }
    }, (err) => {
      $('#actionButton').removeClass("disabled");
      alert(err.data);
    })
  }
  
}