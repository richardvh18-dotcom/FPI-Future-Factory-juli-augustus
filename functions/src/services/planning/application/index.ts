const StartProduction = require('./StartProduction');
const PauseProduction = require('./PauseProduction');
const CompleteProduction = require('./CompleteProduction');
const CancelProduction = require('./CancelProduction');
const MoveProduction = require('./MoveProduction');
const PersonnelManagement = require('./PersonnelManagement');
const QualityControl = require('./QualityControl');
const PrintQueue = require('./PrintQueue');
const Issues = require('./Issues');
const OrderManagement = require('./OrderManagement');
const ProductManagement = require('./ProductManagement');

module.exports = {
  ...StartProduction,
  ...PauseProduction,
  ...CompleteProduction,
  ...CancelProduction,
  ...MoveProduction,
  ...PersonnelManagement,
  ...QualityControl,
  ...PrintQueue,
  ...Issues,
  ...OrderManagement,
  ...ProductManagement,
};
