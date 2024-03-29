import { Injectable } from '@nestjs/common';
import { BadRequestException, MethodNotAllowedException, NotFoundException } from '@nestjs/common/exceptions';
import { InjectModel } from '@nestjs/mongoose';
import { DeleteResult, UpdateResult } from 'mongodb';
import mongoose, { Model } from 'mongoose';
import { checkMember } from 'src/middleware/check-member';
import { checkOwner } from 'src/middleware/check-owner';
import { elementEmptyValidatation } from 'src/middleware/element-empty';
import { validClassId } from 'src/middleware/valid-classId';
import { Class, ClassDocument } from 'src/schemas/class.schema';
import { Lesson, LessonDocument } from 'src/schemas/lesson.schema';
import { Marks, MarksDocument } from 'src/schemas/marks.schema';
import { User, UserDocument } from 'src/schemas/user.schema';
import { GradeBook } from './classes-grade-book.type';
import { ClassConnectDto } from './dto/class-connect.dto';
import { CreateClassDto } from './dto/create-class.dto';
import { RemoveMemberDto } from './dto/remove-member.dto';
import { UpdateClassDto } from './dto/update-class.dto';

@Injectable()
export class ClassesService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Class.name) private classModel: Model<ClassDocument>,
    @InjectModel(Marks.name) private marksModel: Model<MarksDocument>
  ) {} 

  async getClasses(user: User): Promise<{ classes: Class[], notifications: Object }> {
    const userObj = await this.userModel.findOne({_id: user._id}).populate({
      path: 'classes',
      populate: {
        path: 'lessons'
      }
    });
    
    return {classes: userObj.classes, notifications: userObj.notifications};
  }

  async connectToClass(user: User, classConnectDto: ClassConnectDto): Promise<Class> {
    const { accessToken } = classConnectDto;
    const classObj = await this.classModel.findOne({ accessToken });
    elementEmptyValidatation(classObj, `Class not found`);
    
    if(!!user.classes.find((userClass) => userClass.toString() == classObj._id.toString())) {
      throw new MethodNotAllowedException(`You are already in class`);
    }
    await classObj.addMembers(user);
    await user.addClass(classObj);
    return classObj;
  }

  async removeMember(user: User, classId: string, removeMemberDto: RemoveMemberDto): Promise<Class> {
    validClassId(classId, `Wrong path`);
    const classObj = await this.classModel.findOne({ _id: classId });
    elementEmptyValidatation(classObj, `Class not found`);
    const { memberId } = removeMemberDto;
    if(!classObj.members.find((member) => member._id.toString() == memberId)) {
      throw new NotFoundException(`User not found`);
    }
    const member = await this.userModel.findOne({ _id: memberId });
    elementEmptyValidatation(member, `User not found`);
    await member.removeClass(classObj._id);
    return await classObj.removeMembers(user, memberId);
  }

  async removeClasses(user: User, classId: string): Promise<DeleteResult> {
    validClassId(classId, `Wrong path`);
    const classObj = await this.classModel.findOne({_id: classId}).populate('owners').populate('members');
    elementEmptyValidatation(classObj, `Class not found`);
    checkOwner(classObj, user._id.toString(), `You can not remove class`);
    classObj.members.map(async (member) => {
      await member.removeClass(classId);
    })
    classObj.owners.map(async (owner) => {
      await owner.removeClass(classId);
    })
    return await this.classModel.deleteOne({ _id: classId });
  }

  async createClasses(user: User, createClassDto: CreateClassDto): Promise<Class> {
    const { title, description } = createClassDto;
    const classObj = new this.classModel({
      title,
      description,
      owners: user._id,
    });

    await user.addClass(classObj);
    
    return await classObj.save();
  }

  async classInfo(user: User, classId: string): Promise<{ classObj: Class, owner: boolean }> {
    validClassId(classId, `Wrong path`);
    const classObj = await this.classModel.findOne({_id: classId}).populate({
      path: 'lessons',
      populate: {
        path: 'attachedElements'
      }
    }).populate('owners', '_id login surname name').populate('members', '_id login surname name');
    elementEmptyValidatation(classObj, `Class not found`);
    checkMember(classId, user, `You can not open this classroom`);
    
    let owner = false;
    if(!!classObj.owners.find(({_id}) => _id.toString() === user._id.toString())) {
      owner = true;
    }
    return { classObj, owner };
  }

  async getGradeBook(user: User, classId: string): Promise<Marks[]> {
    validClassId(classId, `Class not found`);
    const classObj = await this.classModel.findOne({ _id: classId }).populate('lessons').populate('members', '_id login surname name');
    checkOwner(classObj, user._id.toString(), `You can not open the grade book`);
    const marks = await this.marksModel.find({ class: classObj });
    return marks;
  }

  async updateClassInfo(classId: string, user: User, updateClassDto: UpdateClassDto): Promise<UpdateResult> {
    validClassId(classId, `Wrong path`);
    const { title, description } = updateClassDto;
    const classObj = await this.classModel.findOne({_id: classId});
    elementEmptyValidatation(classObj, `Class not found`);
    checkOwner(classObj, user._id.toString(), `You can not update class info`);
    return await this.classModel.updateOne({ _id: classId }, {title, description});
  }

  async addOwner(classId: string, user: User, updateClassDto: UpdateClassDto): Promise<Class> {
    validClassId(classId, `Wrong path`);
    const { owners } = updateClassDto;
    const classObj = await this.classModel.findOne({_id: classId});
    elementEmptyValidatation(classObj, `Class not found`);
    return await classObj.addOwner(user, owners);
  }

  async removeOwner(classId: string, user: User, updateClassDto: UpdateClassDto): Promise<Class> {
    validClassId(classId, `Wrong path`);
    const { owners } = updateClassDto;
    const classObj = await this.classModel.findOne({_id: classId});
    elementEmptyValidatation(classObj, `Class not found`);
    return await classObj.removeOwner(user, owners);
  }
}
