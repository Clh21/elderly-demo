import React from 'react';
import DigitalTwin from '../DigitalTwin';
import ElderModelDashboardCard from '../ElderModelDashboardCard';
import RoomLocationCard from '../RoomLocationCard';

const DashboardSidePanel = ({
  activeIndoorLayout,
  indoorPosition,
  roomHistory,
  selectedResident,
  selectedWatch,
  watchData,
  onOpenRoomModal,
}) => (
  <div className="space-y-6 lg:col-span-1">
    <DigitalTwin watchId={selectedWatch} watchData={watchData} resident={selectedResident} />
    <RoomLocationCard
      currentPosition={indoorPosition}
      history={roomHistory}
      layout={activeIndoorLayout}
      onTitleClick={onOpenRoomModal}
    />
    <ElderModelDashboardCard layout={activeIndoorLayout} position={indoorPosition} />
  </div>
);

export default DashboardSidePanel;
